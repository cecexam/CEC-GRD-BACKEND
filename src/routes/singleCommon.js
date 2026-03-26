const path = require("path");
const multer = require("multer");
const fs = require("fs");
const express = require("express");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const { admin, db } = require("../config/firebase");

/* ================================
   CSV → JSON
================================ */
function excelToCsv(csvData) {
  const lines = csvData.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(",");
    return headers.reduce((o, h, i) => {
      o[h] = values[i]?.trim() || "";
      return o;
    }, {});
  });
}

/* ================================
   UTILS
================================ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ================================
   GROUPING
=============================== */
function groupStudentsByBatch(students) {
  const map = {};
  students.forEach(s => {
    const batch = s.Batch || "Unknown";
    map[batch] ??= [];
    map[batch].push(s.RollNumber);
  });
  return map;
}

function buildRollToSubject(students) {
  const map = {};
  students.forEach(s => {
    map[s.RollNumber] = s.Common_Subject_1 || s.Subject || "Unknown";
  });
  return map;
}

function buildRollToInfo(students) {
  const map = {};
  students.forEach(s => {
    map[s.RollNumber] = {
      name: s.StudentName || "",
      batch: s.Batch || "",
      dept: s.Department || s.Batch?.replace(/[0-9]/g, '').substring(0, 2) || "Unknown",
      year: s.year || "",
      subject: s.Common_Subject_1 || s.Subject || ""
    };
  });
  return map;
}

/* ================================
   CAPACITY
================================ */
function getHallCapacity(hall, twoPerBench) {
  const R = Number(hall.Rows);
  const C = Number(hall.Columns);
  let cap = 0;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (twoPerBench && c % 3 === 1) continue;
      cap++;
    }
  return cap;
}

function calculateTotalCapacity(halls, twoPerBench) {
  return halls.reduce((s, h) => s + getHallCapacity(h, twoPerBench), 0);
}

/* ================================
   SEATING ENGINE
================================ */
function generateSeatingPlan(halls, groups, rollToInfo) {
  const order = Object.keys(groups);
  const pointers = Object.fromEntries(order.map(k => [k, 0]));
  const result = [];

  function areInConflict(b1, b2) {
    return b1 && b2 && b1 === b2;
  }

  halls.forEach((hall) => {
    const rows = Number(hall.Rows);
    const columns = Number(hall.Columns);
    const seats = Array.from({ length: rows }, () => Array(columns).fill(""));

    let prevColBatch = null;
    const priorityBatches = ['A', 'B', 'F'];

    // Create a mapping of department to its batches
    const deptToBatches = {};
    order.forEach(b => {
      const firstRoll = groups[b][0];
      const dept = firstRoll ? (rollToInfo[firstRoll]?.dept) : "Unknown";
      deptToBatches[dept] ??= [];
      deptToBatches[dept].push(b);
    });

    // Pass 1: Column-wise Interleaving with A, B, F as spreaders + Dept-wise filling
    for (let c = 0; c < columns; c++) {
      let bestBatch = null;
      let maxScore = -1;

      for (const batch of order) {
        const remaining = groups[batch].length - pointers[batch];
        if (remaining > 0 && !areInConflict(batch, prevColBatch)) {
          let score = remaining;

          // Boost score if we are alternating between priority and non-priority
          const isPriority = priorityBatches.includes(batch);
          const prevIsPriority = priorityBatches.includes(prevColBatch);

          if (prevColBatch && isPriority !== prevIsPriority) {
            score += 1000; // Large boost to favor alternating
          }

          if (score > maxScore) {
            maxScore = score;
            bestBatch = batch;
          }
        }
      }

      if (bestBatch) {
        const dept = rollToInfo[groups[bestBatch][0]]?.dept;
        const sameDeptBatches = deptToBatches[dept] || [bestBatch];

        for (let r = 0; r < rows; r++) {
          if (pointers[bestBatch] < groups[bestBatch].length) {
            seats[r][c] = groups[bestBatch][pointers[bestBatch]++];
          } else {
            // Batch finished, try to find another batch from the SAME department
            const nextInDept = sameDeptBatches.find(b => b !== bestBatch && pointers[b] < groups[b].length);
            if (nextInDept && !areInConflict(nextInDept, prevColBatch)) {
              seats[r][c] = groups[nextInDept][pointers[nextInDept]++];
              // Do NOT update bestBatch here to stay consistent with column choice
            }
          }
        }
        prevColBatch = bestBatch;
      } else {
        prevColBatch = null;
      }
    }

    // Pass 2: Greedy Fill for remaining empty spots
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        if (!seats[r][c]) {
          // Prioritize batches that can act as spreaders between existing neighbors
          const leftB = c > 0 ? (rollToInfo[seats[r][c - 1]]?.batch) : null;
          const rightB = c < columns - 1 ? (rollToInfo[seats[r][c + 1]]?.batch) : null;
          const neighborsNeedSpreader = (leftB && !priorityBatches.includes(leftB)) || (rightB && !priorityBatches.includes(rightB));

          const sortedOrder = [...order].sort((a, b) => {
            const remA = groups[a].length - pointers[a];
            const remB = groups[b].length - pointers[b];

            let scoreA = remA;
            let scoreB = remB;

            if (neighborsNeedSpreader) {
              if (priorityBatches.includes(a)) scoreA += 10000;
              if (priorityBatches.includes(b)) scoreB += 10000;
            }

            return scoreB - scoreA;
          });

          for (const batch of sortedOrder) {
            if (pointers[batch] < groups[batch].length) {
              if (!areInConflict(batch, leftB) && !areInConflict(batch, rightB)) {
                seats[r][c] = groups[batch][pointers[batch]++];
                break;
              }
            }
          }
        }
      }
    }

    result.push({
      hallName: hall.HallName,
      seats: seats,
      maxBench: 3
    });
  });

  return { result, pointers };
}

function printHallAllocation(name, seats) {
  console.log("\n=============================");
  console.log("Hall:", name);
  console.log("=============================");
  seats.forEach((row, i) => {
    const line = row.map(s => s || " --- ");
    console.log(`Row ${i + 1}:`, line.join(" | "));
  });
  console.log("=============================\n");
}

/* ================================
   FIRESTORE FORMAT
================================ */
function formatForFirestore(hall, seats, rollToInfo) {
  const hallData = {
    rows: Number(hall.Rows),
    columns: Number(hall.Columns),
  };
  let seatNo = 1;
  seats.forEach((row, r) => {
    const arr = [];
    row.forEach((roll, c) => {
      if (!roll) return;
      const info = rollToInfo[roll];
      arr.push({
        roll,
        name: info.name,
        batch: info.batch,
        year: info.year,
        subject: info.subject,
        hall: hall.HallName,
        row: r + 1,
        bench: c + 1,
        seat: seatNo++
      });
    });
    if (arr.length) hallData[`row${r}`] = arr;
  });
  return hallData;
}

/* ================================
   API
================================ */
router.post(
  "/",
  upload.fields([{ name: "students" }, { name: "halls" }]),
  async (req, res) => {
    console.log("Allocation Started...");
    try {
      const students = excelToCsv(fs.readFileSync(req.files.students[0].path, "utf8"));
      const halls = excelToCsv(fs.readFileSync(req.files.halls[0].path, "utf8"));

      const groups = groupStudentsByBatch(students);
      const rollToInfo = buildRollToInfo(students);

      const { result: raw, pointers } = generateSeatingPlan(halls, groups, rollToInfo);

      const firestoreHalls = {};
      raw.forEach(r => {
        const hall = halls.find(h => h.HallName === r.hallName);
        printHallAllocation(r.hallName, r.seats);
        firestoreHalls[r.hallName] = formatForFirestore(hall, r.seats, rollToInfo);
      });

      // Check for unallocated students
      const missed = [];
      Object.keys(groups).forEach(batch => {
        const count = groups[batch].length - pointers[batch];
        if (count > 0) missed.push({ batch, count });
      });

      console.log("Allocation Completed.");
      if (missed.length) {
        console.warn("Unallocated students detected:", missed);
        return res.json({
          success: false,
          unallocated: missed,
          totalMissed: missed.reduce((s, m) => s + m.count, 0),
          reason: "Unallocated students detected, please try again with more halls"
        });
      }

      // Store to Firestore
      await db.collection("examAllocations").add({
        name: req.body.examName || "Untitled Exam",
        sems: req.body.years || [],
        isElective: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          totalStudents: students.length,
          totalHalls: halls.length,
          studentsPerBench: raw[0]?.maxBench || 0
        },
        halls: firestoreHalls,
        examDate: req.body.examDate || ""
      });

      res.json({
        success: true,
        unallocated: missed,
        totalMissed: missed.reduce((s, m) => s + m.count, 0)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

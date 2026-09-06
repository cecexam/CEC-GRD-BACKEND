const express = require("express");

const router = express.Router();

const { admin, db } = require("../config/firebase");
const { badRequest, notFound, serverError } = require("../utils/apiResponse");


function reconstructAllocation(hallsData) {
  const allocation = {};

  for (const [hallName, hallData] of Object.entries(hallsData)) {
    const R = hallData.rows;
    const C = hallData.columns;

    if (!R || !C) continue;

    // Create empty matrix
    const matrix = Array.from({ length: R }, () =>
      Array.from({ length: C }, () => []),
    );

    for (const [key, value] of Object.entries(hallData)) {
      if (!/^row\d+$/.test(key)) continue;

      if (!Array.isArray(value)) continue;

      const rowIndex = Number(key.replace("row", ""));

      value.forEach((s) => {
        if (!s || typeof s !== "object") return;

        const benchIndex = s.bench - 1;

        if (matrix[rowIndex] && matrix[rowIndex][benchIndex]) {
          matrix[rowIndex][benchIndex].push({
            Name: s.name,
            RollNumber: s.roll,
            year: s.year,
            Batch: s.batch,
          });
        }
      });
    }

    const hasAllocatedStudents = matrix.some((row) =>
      row.some((bench) => Array.isArray(bench) && bench.length > 0),
    );

    if (!hasAllocatedStudents) continue;

    allocation[hallName] = matrix;
  }

  console.log("✅ Allocation reconstructed");

  return allocation;
}

function formatWithHalfDay(dateTimeStr) {
  const [date, time] = dateTimeStr.split("T");
  const hour = parseInt(time.split(":")[0], 10);
  const period = hour < 12 ? "Forenoon" : "Afternoon";
  return `${date} ${period}`;
}

function splitIntoRanges(rolls) {
  if (!rolls || rolls.length === 0) return [];

  // Proper numeric sort
  rolls.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const ranges = [];
  let start = rolls[0];
  let prev = rolls[0];

  const getParts = (roll) => {
    const match = roll.match(/^(.*?)(\d+)$/);
    return match ? { prefix: match[1], num: parseInt(match[2], 10) } : { prefix: roll, num: 0 };
  };

  for (let i = 1; i < rolls.length; i++) {
    const current = rolls[i];
    const pPrev = getParts(prev);
    const pCurr = getParts(current);

    if (pCurr.prefix === pPrev.prefix && pCurr.num === pPrev.num + 1) {
      prev = current;
    } else {
      ranges.push({
        from: start,
        to: prev,
        count: getParts(prev).num - getParts(start).num + 1,
      });

      start = current;
      prev = current;
    }
  }

  // Push last range
  ranges.push({
    from: start,
    to: prev,
    count: getParts(prev).num - getParts(start).num + 1,
  });

  return ranges;
}

function generateHallHTML(allocation, date, semType, yearSem) {
  const hallHTMLs = {};

  for (const [hallName, rows] of Object.entries(allocation)) {
    const students = [];

    const hallType = rows.hallType || "Bench";

    /* Collect Students */
    rows.forEach((row, rIdx) =>
      row.forEach((bench, bIdx) =>
        bench.forEach((s) => {
          if (!s) return;

          students.push({
            name: s.Name,
            roll: s.RollNumber,
            year: s.year,
            row: rIdx + 1,
            seatLabel: String.fromCharCode(65 + rIdx) + (bIdx + 1),
          });
        }),
      ),
    );

    /* Group by Year */
    const yearMap = {};

    students.forEach((s) => {
      yearMap[s.year] ??= [];
      yearMap[s.year].push(s);
    });

    Object.values(yearMap).forEach((arr) =>
      arr.sort((a, b) => a.name.localeCompare(b.name)),
    );

    /* Base HTML */

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>

body {
  font-family: Arial;
  font-size: 12px;
  margin: 6mm;
}

h1, h2, h3, h5 {
  text-align: center;
  margin: 4px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 18px;
}

th, td {
  border: 1px solid #000;
  font-size: 12px;
  padding: 4px;
  text-align: center;
}

th {
  background: #eee;
}

 



@media print {

  body {
    margin-left: 4mm;
    margin-right: 4mm;
  }

   .page-break {
    page-break-before: always;
    break-before: page;
  }

}



.grid-container {
  margin-top: 20px;
   
}

.direction-board {
  text-align: center;
  font-weight: bold;
  margin-bottom: 15px;
  border: 2px solid black;
  padding: 8px;
}

.row-visual {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.row-label-visual {
  width: 30px;
  font-weight: bold;
  text-align: center;
}

.seat-box {
  border-radius:5px;
  width: 80px;
  height: 50px;
  border: 2px solid black;
  margin-right: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 12px;
}

.empty-seat {
  background: #f5f5f5;
  color: #999;
}

.seat-roll {
  font-weight: bold;
}

.seat-year {
  font-size: 10px;
}


</style>
</head>

<body>
`;



    /* ================= GRID ================= */

    html += `

<h2>Seating Grid [${hallName}]</h2>
<h5>Exam Date: ${formatWithHalfDay(date)}</h5>

<div class="grid-container">
  <div style="text-align: center; font-weight: bold; margin-bottom: 15px; padding: 8px;">
    Black Board
  </div>
`;

    rows.forEach((row, r) => {
      html += `<div class="row-visual">`;

      const rowLabel = r + 1;

      html += `<div class="row-label-visual">${rowLabel}</div>`;

      row.forEach((seatData) => {
        const student = seatData && seatData.length ? seatData[0] : null;

        html += `<div class="seat-box ${student ? "" : "empty-seat"}">`;

        if (student) {
          html += `
        <span class="seat-roll">${student.RollNumber || "?"}</span>
      `;
        } else {
          html += `Empty`;
        }

        html += `</div>`;
      });

      html += `</div>`;
    });

    html += `
</div>
`;

    html += `
<div class="page-break"></div>

<h2>Attendance Sheet [${hallName}]</h2>
<h5>Exam Date: ${formatWithHalfDay(date)}</h5>
`;
    for (const year of Object.keys(yearMap).sort((a, b) => a - b)) {
      html += `
<h3>Semester: ${findSem(year, semType)}</h3>

<table>
<tr>
  <th>Sl</th>
  <th>Name</th>
  <th>Roll</th>
  <th>Signature</th>
</tr>
`;

      // 🔥 Strict Roll Number Sorting
      const sortedStudents = [...yearMap[year]].sort((a, b) => {
        const regex = /^([A-Z]+\d+)([A-Z])(\d+)$/;

        const matchA = a.roll.match(regex);
        const matchB = b.roll.match(regex);

        // Fallback if pattern doesn't match
        if (!matchA || !matchB) {
          return a.roll.localeCompare(b.roll, undefined, { numeric: true });
        }

        const [, prefixA, batchA, numA] = matchA;
        const [, prefixB, batchB, numB] = matchB;

        // 1️⃣ Compare prefix (EC24 etc)
        if (prefixA !== prefixB) {
          return prefixA.localeCompare(prefixB);
        }

        // 2️⃣ Compare batch letter (A before B)
        if (batchA !== batchB) {
          return batchA.localeCompare(batchB);
        }

        // 3️⃣ Compare numeric part
        return Number(numA) - Number(numB);
      });

      sortedStudents.forEach((s, i) => {
        html += `
<tr>
  <td>${i + 1}</td>
  <td>${s.name}</td>
  <td>${s.roll}</td>
  <td></td>
</tr>
`;
      });

      html += `</table>`;
    }

    html += `
  <br><br>
  <table style="width:100%; margin-bottom:20px;">
    <tr>
      <th style="text-align:left;">Absentees (Roll Numbers)</th>
    </tr>
    <tr>
      <td style="height:60px;"></td>
    </tr>
  </table>
  <table style="width:100%; border:none; margin-top:40px;">
    <tr style="border:none;">
      <td style="border:none; width:50%; text-align:left;">
        Name of Invigilator: ______________________________
      </td>
      <td style="border:none; width:50%; text-align:right;">
        Signature: ______________________________
      </td>
    </tr>
  </table>
`;

    hallHTMLs[hallName] = html;
  }

  return hallHTMLs;
}




function getBranchFromRoll(roll) {
  const match = roll.match(/^([A-Z]+)/);
  return match ? match[1] : "Other";
}

function findSem(year, semType) {
  console.log(year);
  console.log(semType);
  
  
  const y = String(year);
  if (y.includes("1")) {
    return semType == "Even" ? "S2" : "S1"
  } else if (y.includes("2")) {
    return semType == "Even" ? "S4" : "S3"
  } else if (y.includes("3")) {
    return semType == "Even" ? "S6" : "S5"
  } else if (y.includes("4")) {
    return semType == "Even" ? "S8" : "S7"
  } else {
    return semType == "Even" ? "S8" : "S7"
  }
}

function parseSelectedYears(yearInput) {
  if (Array.isArray(yearInput)) return yearInput;

  if (typeof yearInput === "string") {
    try {
      const parsed = JSON.parse(yearInput);
      return Array.isArray(parsed) ? parsed : [yearInput];
    } catch {
      return [yearInput];
    }
  }

  return yearInput ? [yearInput] : [];
}

function resolveYearDisplay(storedYear, selectedYears) {
  if (storedYear === "A") return selectedYears[0] ?? "A";
  if (storedYear === "B") return selectedYears[1] ?? "B";
  return storedYear;
}

function generateSummaryHTML(allocation, date, semType, year, seriesName) {
  const selectedYears = parseSelectedYears(year);
  const [datePart, timePart] = date ? date.split("T") : ["", ""];
  const hour = timePart ? parseInt(timePart.split(":")[0], 10) : 0;
  const sessionLabel = hour < 12 ? "FN" : "AN";
  let html = `
  <style>
    body { 
      font-family: "Times New Roman", serif; 
      font-size: 14px; 
    }

    .main-header {
      border: 2px solid #000;
      padding: 10px;
      text-align: center;
      margin-bottom: 15px;
    }

    .summary-table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #000;
    }

    .summary-table th, 
    .summary-table td {
      border: 1px solid #000;
      padding: 6px 8px;
      text-align: center;
    }

    .branch-header {
      font-weight: bold;
    }

    h2, h3, h5 {
      margin: 3px 0;
    }
    
    td{
      border: 1px solid #000;
      font-weight: bold;
    }

  @media print {
  .page-break {
    page-break-before: always;
    break-before: page;
  }
}
  </style>
  
  `;

    
  // ==========================
  // 1️⃣ Flatten Data
  // ==========================
  const allStudentsByYear = {};

  Object.entries(allocation).forEach(([hallName, rows]) => {
    rows.forEach((row) => {
      row.forEach((bench) => {
        bench.forEach((s) => {
          if (!s) return;
          const storedYear = s.year || "UNKNOWN";

          allStudentsByYear[storedYear] ??= [];
          allStudentsByYear[storedYear].push({
            roll: s.RollNumber,
            hall: hallName,
            branch: getBranchFromRoll(s.RollNumber),
          });
        });
      });
    });
  });

  const buildBranchSegments = (students) => {
    const branchSegments = {};

    // ==========================
    // 2️⃣ Sort by Branch → Roll
    // ==========================
    students.sort((a, b) => {
      if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);

      return a.roll.localeCompare(b.roll, undefined, { numeric: true });
    });

    // ==========================
    // 3️⃣ Group by Branch → Hall Ranges
    // ==========================
    if (students.length === 0) return branchSegments;

    let currentBranch = students[0].branch;
    let currentHall = students[0].hall;
    let startRoll = students[0].roll;
    let endRoll = students[0].roll;

    const pushSegment = (branch, start, end, hall) => {
      if (!branchSegments[branch]) branchSegments[branch] = [];
      const range = start === end ? start : `${start}-${end}`;
      branchSegments[branch].push({ range, hall });
    };

    const getParts = (roll) => {
      const match = roll.match(/^(.*?)(\d+)$/);
      return match ? { prefix: match[1], num: parseInt(match[2], 10) } : { prefix: roll, num: 0 };
    };

    for (let i = 1; i < students.length; i++) {
      const s = students[i];
      const pPrev = getParts(endRoll);
      const pCurr = getParts(s.roll);

      if (s.branch === currentBranch && s.hall === currentHall && pCurr.prefix === pPrev.prefix && pCurr.num === pPrev.num + 1) {
        endRoll = s.roll;
      } else {
        pushSegment(currentBranch, startRoll, endRoll, currentHall);
        currentBranch = s.branch;
        currentHall = s.hall;
        startRoll = s.roll;
        endRoll = s.roll;
      }
    }

    pushSegment(currentBranch, startRoll, endRoll, currentHall);
    return branchSegments;
  };

  // ==========================
  // 4️⃣ Render Year-wise Tables
  // ==========================
  Object.keys(allStudentsByYear)
    .sort()
    .forEach((storedYear, index) => {
      const displayYear = resolveYearDisplay(storedYear, selectedYears);
      const semLabel = String(displayYear).match(/^\d+$/)
        ? findSem(displayYear, semType)
        : `Year ${displayYear}`;
      const branchSegments = buildBranchSegments(allStudentsByYear[storedYear]);

      html += `
  ${index > 0 ? '<div class="page-break"></div>' : ''}
  <table class="summary-table">
    <thead>
      <tr>
        <th colspan="4" style="border-top: hidden; border-left: hidden; border-right: hidden; border-bottom: none; padding: 0 0 20px 0; text-align: left; font-weight: normal;">
          <div style="border: 2px solid #000; padding: 10px; background: #f9f9f9;">
            <h1 style="margin:0; font-size: 20px;">College of Engineering Chengannur</h1>
            <h5 style="margin:2px 0 6px 0; font-size: 13px; font-weight: normal;">(Managed by IHRD, A Govt of Kerala Undertaking)</h5>
            <h2 style="margin:5px 0; font-size: 18px;">${seriesName || "Hall Allocation Summary"}</h2>
            <h2 style="margin:5px 0; font-size: 18px;">Roll Number Wise Allocation - ${semLabel}</h2>
            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px;">
              <span>Date: ${datePart}</span>
              <span style=" font-weight:200;">Generated using CEC-GRID</span>
              <span>Session: ${sessionLabel}</span>
            </div>
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
  `;

      Object.keys(branchSegments)
        .sort()
        .forEach((branch) => {
          html += `
      <tr>
        <th colspan="4" class="branch-header">${branch}</th>
      </tr>
      <tr>
        <th>Roll No.</th>
        <th>Class Room</th>
        <th>Roll No.</th>
        <th>Class Room</th>
      </tr>
    `;

          const segments = branchSegments[branch];

          for (let i = 0; i < segments.length; i += 2) {
            const seg1 = segments[i];
            const seg2 = segments[i + 1];

            html += `<tr>`;

            html += `<td>${seg1.range}</td><td>${seg1.hall}</td>`;

            if (seg2) {
              html += `<td>${seg2.range}</td><td>${seg2.hall}</td>`;
            } else {
              html += `<td></td><td></td>`;
            }

            html += `</tr>`;
          }
        });

      html += `</tbody></table>`;
    });

  const hallSummaryByYear = {};

  for (const [hall, rows] of Object.entries(allocation)) {
    const map = {};

    rows.forEach((row) =>
      row.forEach((bench) =>
        bench.forEach((s) => {
          if (!s) return;

          const storedYear = s.year || "UNKNOWN";

          map[storedYear] ??= {};
          map[storedYear][s.Batch ?? "UNKNOWN"] ??= [];
          map[storedYear][s.Batch ?? "UNKNOWN"].push(s.RollNumber);
        }),
      ),
    );

    Object.entries(map).forEach(([storedYear, batches]) => {
      hallSummaryByYear[storedYear] ??= [];
      hallSummaryByYear[storedYear].push({ hall, batches });
    });
  }

  Object.keys(hallSummaryByYear).sort().forEach((storedYear) => {
    const hallEntries = hallSummaryByYear[storedYear];
    const displayYear = resolveYearDisplay(storedYear, selectedYears);
    const semLabel = String(displayYear).match(/^\d+$/)
      ? findSem(displayYear, semType)
      : `Year ${displayYear}`;

    html += `
  <style>
    body { font-family: Arial; font-size: 14px; }
    table { width:100%; border-collapse: collapse; margin-bottom:25px; }
    th,td { border:1px solid #000; padding:6px; }
    th { background:#eee; }
  </style>
  <div class="page-break"></div>
  <div class="main-header">
    <h2>College of Engineering Chengannur</h2>
    <h5>(Managed by IHRD, A Govt of Kerala Undertaking)</h5>
    <h3>Hall Allocation Summary - ${semLabel}</h3>
    <div style="font-weight:bold; margin-top:5px;">
      Date: ${formatWithHalfDay(date)}
    </div>
  </div>
  `;

    for (const { hall, batches } of hallEntries) {
      html += `<h3>Hall: ${hall}</h3>

      <table>
        <tr>
          <th>Year</th>
          <th>Batch</th>
          <th>From</th>
          <th>To</th>
          <th>Count</th>
          <th>Absentees</th>
        </tr>`;

      Object.entries(batches).forEach(([batch, rolls]) => {
        const ranges = splitIntoRanges(rolls);

        ranges.forEach((range) => {
          html += `
            <tr>
              <td>${displayYear}</td>
              <td>${batch}</td>
              <td>${range.from}</td>
              <td>${range.to}</td>
              <td>${range.count}</td>
              <td></td>
            </tr>
          `;
        });
      });

      html += "</table>";
    }
  });

  return html;
}

/* =========================================================
   📊 GENERATE SUMMARY HTML
========================================================= */

/* =========================================================
   🚀 ROUTE: CACHE → GENERATE → STORE → RETURN
========================================================= */
router.post("/", async (req, res) => {
  try {
    const { examId } = req.body;
    console.log(req.body);

    if (!examId) {
      return badRequest(res, "Exam ID is required to generate the PDF.");
    }

    const ref = db.collection("examAllocations").doc(examId);

    const snap = await ref.get();

    if (!snap.exists) {
      return notFound(res, "Exam allocation was not found.");
    }

    const data = snap.data();

    /* =====================================
       ✅ RETURN CACHE IF EXISTS
    ===================================== */
    // if (data.summary && data.rooms) {
    //   console.log("✅ Returning cached HTML");

    //   return res.json({
    //     success: true,
    //     cached: true,
    //     summary: data.summary,
    //     rooms: data.rooms,
    //   });
    // }
    /* =====================================
       ⚡ GENERATE NEW
    ===================================== */
    console.log("⚡ Generating new HTML1");

    const allocation = reconstructAllocation(data.halls);

    const roomHTMLs = generateHallHTML(allocation, data.examDate, data.semType, data.sems);
    const summaryHTML = generateSummaryHTML(allocation, data.examDate, data.semType, data.sems, data.seriesName);

    /* =====================================
       💾 SAVE TO FIRESTORE
    ===================================== */
    await ref.update({
      summary: summaryHTML,
      rooms: roomHTMLs,
      htmlGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* =====================================
       📤 RETURN RESPONSE
    ===================================== */
    return res.json({
      success: true,
      cached: false,
      summary: summaryHTML,
      rooms: roomHTMLs,
    });
  } catch (err) {
    console.error("ERROR:", err);
    return serverError(res, err, "Failed to generate common seating PDF.");
  }
});

module.exports = router;

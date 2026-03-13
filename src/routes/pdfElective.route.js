const express = require("express");

const router = express.Router();

const { admin, db } = require("../config/firebase");

/* =====================================================
   🔁 RECONSTRUCT allocation MATRIX FROM FIRESTORE
===================================================== */
function reconstructAllocation(hallsData) {
  const allocation = {};

  for (const [hallName, hallData] of Object.entries(hallsData)) {
    const R = hallData.rows;
    const C = hallData.columns;

    if (!R || !C) continue;

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

    matrix.hallType = hallData.type || "Bench"; // Attach type metadata
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
/* =====================================================
   📄 GENERATE HALL + ATTENDANCE HTML
===================================================== */
/* =====================================================
   📄 GENERATE HALL + ATTENDANCE HTML
===================================================== */
function generateHallHTML(allocation, date) {
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

 

/* ================= PRINT ================= */

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

/* ================= GRID (BIG SIZE) ================= */

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

    /* ================= SEATING LIST ================= */

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

    /* ================= ATTENDANCE ================= */
    html += `
<div class="page-break"></div>

<h2>Attendance Sheet [${hallName}]</h2>
<h5>Exam Date: ${formatWithHalfDay(date)}</h5>
`;
    for (const year of Object.keys(yearMap).sort((a, b) => a - b)) {
      html += `
<h3>Year: ${year}</h3>

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


/* =====================================================
   📊 GENERATE ROLL SUMMARY HTML
===================================================== */
function generateSummaryHTML(allocation, date) {
  let html = `
  <style>
    body { font-family: Arial; font-size: 13px; }
    h2 { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-bottom:25px; }
    th, td { border: 1px solid #000; padding: 8px; }
    th { background: #eee; }
  </style>
    <h2>College of Engineering Chengannur</h2>
    <h2>First Series Examination Feb26</h2>
    <h2>Hall Summary(Generated Using CEC-GRID)</h2>
    <h5>Exam Date:${formatWithHalfDay(date)}</h5>
  `;

  for (const [hallName, rows] of Object.entries(allocation)) {
    const map = {};

    rows.forEach((row) =>
      row.forEach((bench) =>
        bench.forEach((s) => {
          if (!s) return;

          const roll = s.RollNumber;
          const year = s.year || "UNKNOWN";
          const batch = s.Batch || "UNKNOWN";

          map[year] ??= {};
          map[year][batch] ??= [];

          map[year][batch].push(roll);
        }),
      ),
    );

    html += `
    <h3>Hall: ${hallName}</h3>

    <table>
      <tr>
        <th>Year</th>
        <th>Batch</th>
        <th>Roll Numbers</th>
        <th>Absentees</th>
      </tr>
    `;

    Object.keys(map)
      .sort()
      .forEach((year) =>
        Object.keys(map[year])
          .sort()
          .forEach((batch) => {
            html += `
          <tr>
            <td><b>${year == "A" ? 4 : 2}</b></td>
            <td><b>${batch}</b></td>
            <td style="text-align:left;"><b>${map[year][batch].sort().join(", ")}</b></td>
            <td></td>
          </tr>
          `;
          }),
      );

    html += `</table>`;
  }

  /* =====================================================
    PAGE BREAK
 ===================================================== */
  const yearBranchHall = {};

  for (const [hallName, rows] of Object.entries(allocation)) {
    for (const row of rows) {
      for (const bench of row) {
        for (const s of bench) {
          if (!s) continue;

          let yearNumber = Number(s.year);
          if (isNaN(yearNumber)) {
            yearNumber = s.year === "A" ? 4 : 3;
          }

          const branchMatch = s.RollNumber.match(/^[A-Za-z]+/);
          const branch = branchMatch ? branchMatch[0] : "UNKNOWN";
          const batch = s.Batch || "UNKNOWN";

          yearBranchHall[yearNumber] ??= {};
          yearBranchHall[yearNumber][branch] ??= {};
          yearBranchHall[yearNumber][branch][hallName] ??= {};
          yearBranchHall[yearNumber][branch][hallName][batch] ??= [];

          yearBranchHall[yearNumber][branch][hallName][batch].push(s.RollNumber);
        }
      }
    }
  }

html = `

<table border="1" cellspacing="0" cellpadding="3">
    <tr>
        <th>Year</th>
        <th>Batch</th>
        <th>RollNo</th>
        <th>HallNo</th>
    </tr>
`;

Object.keys(yearBranchHall)
  .sort((a, b) => a - b)
  .forEach((year) => {

    const branches = yearBranchHall[year];

    // Collect all batches across all branches for this year
    let yearRowCount = 0;

    Object.keys(branches).forEach(branch => {
      Object.keys(branches[branch]).forEach(hall => {
        Object.keys(branches[branch][hall]).forEach(batch => {
          yearRowCount++;
        });
      });
    });

    let yearPrinted = false;

    // Create batchMap → batch grouped across branches
    const batchMap = {};

    Object.keys(branches).forEach(branch => {
      Object.keys(branches[branch]).forEach(hall => {
        Object.keys(branches[branch][hall]).forEach(batch => {
          if (!batchMap[batch]) batchMap[batch] = [];
          batchMap[batch].push({
            hall,
            rolls: branches[branch][hall][batch]
          });
        });
      });
    });

    Object.keys(batchMap).sort().forEach((batch) => {

      const batchRows = batchMap[batch];
      const batchRowCount = batchRows.length;

      let batchPrinted = false;

      batchRows.forEach(({ hall, rolls }) => {

        html += `<tr>`;

        // Year rowspan
        if (!yearPrinted) {
          html += `<td rowspan="${yearRowCount}">${year}</td>`;
          yearPrinted = true;
        }

        // Batch rowspan
        if (!batchPrinted) {
          html += `<td rowspan="${batchRowCount}">${batch}</td>`;
          batchPrinted = true;
        }

        html += `
            <td>${rolls.sort().join(", ")}</td>
            <td>${hall}</td>
        </tr>`;
      });

    });

  });

html += `
</table>
`;

   /* =====================================================
   🏫 HALL WISE SUMMARY TABLE
===================================================== */

html += `
<div class="page-break"></div>

<h3>Hall Wise Student Summary</h3>

<table>
<tr>
  <th>Hall</th>
  <th>Roll Numbers</th>
  <th>Total Students</th>
  <th>Total Absentees</th>
</tr>
`;

for (const [hallName, rows] of Object.entries(allocation)) {

  const rolls = [];

  rows.forEach(row =>
    row.forEach(bench =>
      bench.forEach(s => {
        if (!s) return;
        rolls.push(s.RollNumber);
      })
    )
  );

  rolls.sort();

  html += `
<tr>
  <td><b>${hallName}</b></td>
  <td style="text-align:left;">${rolls.join(", ")}</td>
  <td><b>${rolls.length}</b></td>
  <td></td>
</tr>
`;
}

html += `</table>`;

  return html;
}

/* =====================================================
   🚀 ROUTE: CACHE → GENERATE → STORE → RETURN
===================================================== */
router.post("/", async (req, res) => {
  try {
    const { examId } = req.body;
    console.log("sddcvdhbvjn ");

    if (!examId) {
      return res.status(400).json({ error: "examId required" });
    }

    const ref = db.collection("examAllocations").doc(examId);

    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Allocation not found" });
    }

    const data = snap.data();

    /* =====================================
       ✅ RETURN CACHE
    ===================================== */
    // if (data.hallHtml && data.summaryHtml) {
    //   console.log("✅ Returning cached HTML");

    //   return res.json({
    //     success: true,
    //     cached: true,
    //     halls: data.hallHtml,
    //     summary: data.summaryHtml,
    //   });
    // }

    /* =====================================
       ⚡ GENERATE
    ===================================== */

    console.log("⚡ Generating new HTML");

    const allocation = reconstructAllocation(data.halls);

    const hallHTML = generateHallHTML(allocation, data.examDate);
    const summaryHTML = generateSummaryHTML(allocation, data.examDate);

    /* =====================================
       💾 SAVE
    ===================================== */

    await ref.update({
      hallHtml: hallHTML,
      summaryHtml: summaryHTML,
      htmlGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* =====================================
       📤 RETURN
    ===================================== */

    return res.json({
      success: true,
      cached: false,
      halls: hallHTML,
      summary: summaryHTML,
    });
  } catch (err) {
    console.error("ERROR:", err);

    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

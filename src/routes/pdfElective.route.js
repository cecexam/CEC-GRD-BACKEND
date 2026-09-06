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
            subject: s.subject,
          });
        }
      });
    }

    const hasAllocatedStudents = matrix.some((row) =>
      row.some((bench) => Array.isArray(bench) && bench.length > 0),
    );

    if (!hasAllocatedStudents) continue;

    matrix.hallType = hallData.type || "Bench"; 
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

function findSem(year, semType) {
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

function generateHallHTML(allocation, date, semType) {
  const hallHTMLs = {};

  for (const [hallName, rows] of Object.entries(allocation)) {
    const students = [];

    const hallType = rows.hallType || "Bench";

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

    const yearMap = {};

    students.forEach((s) => {
      yearMap[s.year] ??= [];
      yearMap[s.year].push(s);
    });

    Object.values(yearMap).forEach((arr) =>
      arr.sort((a, b) => a.name.localeCompare(b.name)),
    );

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
<h3>Semester: ${findSem(year, semType)}</h3>

<table>
<tr>
  <th>Sl</th>
  <th>Name</th>
  <th>Roll</th>
  <th>Signature</th>
</tr>
`;

  
      const sortedStudents = [...yearMap[year]].sort((a, b) => {
        const regex = /^([A-Z]+\d+)([A-Z])(\d+)$/;

        const matchA = a.roll.match(regex);
        const matchB = b.roll.match(regex);

  
        if (!matchA || !matchB) {
          return a.roll.localeCompare(b.roll, undefined, { numeric: true });
        }

        const [, prefixA, batchA, numA] = matchA;
        const [, prefixB, batchB, numB] = matchB;

    
        if (prefixA !== prefixB) {
          return prefixA.localeCompare(prefixB);
        }

    
        if (batchA !== batchB) {
          return batchA.localeCompare(batchB);
        }

      
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
function generateSummaryHTML(allocation, date, semType, seriesName, selectedYearInput) {
  const selectedYears = parseSelectedYears(selectedYearInput);
  console.log(semType);
  console.log(seriesName);
  
  
  const [datePart, timePart] = date ? date.split("T") : ["", ""];
  const hour = timePart ? parseInt(timePart.split(":")[0], 10) : 0;
  const sessionLabel = hour < 12 ? "FN" : "AN";
  let html = "";
  // let html = `
  // <style>
  //   body { font-family: Arial; font-size: 13px; }
  //   h2 { text-align: center; }
  //   table { width: 100%; border-collapse: collapse; margin-bottom:25px; }
  //   th, td { border: 1px solid #000; padding: 8px; }
  //   th { background: #eee; }
  // </style>
  //   <h2>College of Engineering Chengannur</h2>
  //   <h2>First Series Examination Feb26</h2>
  //   <h2>Hall Summary(Generated Using CEC-GRID)</h2>
  //   <h5>Exam Date:${datePart} | Session: ${sessionLabel}</h5>
  // `;

  // for (const [hallName, rows] of Object.entries(allocation)) {
  //   const map = {};

  //   rows.forEach((row) =>
  //     row.forEach((bench) =>
  //       bench.forEach((s) => {
  //         if (!s) return;

  //         const roll = s.RollNumber;
  //         const year = s.year || "UNKNOWN";
  //         const batch = s.Batch || "UNKNOWN";

  //         map[year] ??= {};
  //         map[year][batch] ??= [];

  //         map[year][batch].push(roll);
  //       }),
  //     ),
  //   );

  //   html += `
  //   <h3>Hall: ${hallName}</h3>

  //   <table>
  //     <tr>
  //       <th>Year</th>
  //       <th>Batch</th>
  //       <th>Roll Numbers</th>
  //       <th>Absentees</th>
  //     </tr>
  //   `;

  //   Object.keys(map)
  //     .sort()
  //     .forEach((year) =>
  //       Object.keys(map[year])
  //         .sort()
  //         .forEach((batch) => {
  //           html += `
  //         <tr>
  //           <td><b>${year == "A" ? 4 : 2}</b></td>
  //           <td><b>${batch}</b></td>
  //           <td style="text-align:left;"><b>${map[year][batch].sort().join(", ")}</b></td>
  //           <td></td>
  //         </tr>
  //         `;
  //         }),
  //     );

  //   html += `</table>`;
  // }

  /* =====================================================
    PAGE BREAK
 ===================================================== */
  const yearBranchHall = {};

  for (const [hallName, rows] of Object.entries(allocation)) {
    for (const row of rows) {
      for (const bench of row) {
        for (const s of bench) {
          if (!s) continue;

          const yearNumber = resolveYearDisplay(s.year, selectedYears);

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

  Object.keys(yearBranchHall)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((year) => {
      const branches = yearBranchHall[year];

      html += `
<div class="page-break"></div>

<table border="1" cellspacing="0" cellpadding="3" style="width:100%; border-collapse:collapse; table-layout: fixed;">
    <thead>
    <tr>
      <th colspan="3" style="border-top: hidden; border-left: hidden; border-right: hidden; border-bottom: none; padding: 0 0 20px 0; text-align: left; font-weight: normal;">
        <div style="border: 2px solid #000; padding: 10px; background: #f9f9f9;">
          <h1 style="margin:0; font-size: 20px;">College of Engineering Chengannur</h1>
          <h5 style="margin:2px 0 6px 0; font-size: 13px; font-weight: normal;">(Managed by IHRD, A Govt of Kerala Undertaking)</h5>
          <h2 style="margin:5px 0; font-size: 18px;">${seriesName || "Hall Allocation Summary"}</h2>
          <h2 style="margin:5px 0; font-size: 18px;">Roll Number Wise Allocation - ${findSem(year, semType)}</h2>
          <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px;">
            <span>Date: ${datePart}</span>
            <span style=" font-weight:200;">Generated using CEC-GRID</span>
            <span>Session: ${sessionLabel}</span>
          </div>
        </div>
      </th>
    </tr>
    <tr style="background: #333; color: #fff;">
        <th style="width: 10%; border: 1px solid #000; padding: 8px; color: #000;">Batch</th>
        <th style="width: 75%; border: 1px solid #000; padding: 8px; color: #000;">Roll Numbers</th>
        <th style="width: 15%; border: 1px solid #000; padding: 8px; color: #000;">Hall</th>
    </tr>
    </thead>
    <tbody>
`;

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
           
          if (!batchPrinted) {
            html += `<td rowspan="${batchRowCount}" style="text-align:center; font-weight:bold;">${batch}</td>`;
            batchPrinted = true;
          }

          html += `
            <td style="text-align:left; font-size: 12px; padding: 8px; font-weight:bold; color: #000;">${rolls.sort().join(", ")}</td>
            <td style="text-align:center; font-weight:bold; font-size: 14px; color: #000;">${hall}</td>
        </tr>`;
        });
      });

      html += `</tbody></table>`;
    });


  /* =====================================================
     🏫 HALL WISE YEAR SUMMARY (Split by Year)
  ===================================================== */

  // dataByYear[year] = [ { hallName, rolls, breakdownStr, count } ]
  const dataByYear = {};

  for (const [hallName, rows] of Object.entries(allocation)) {
    const tempMap = {}; // year -> { rolls: [], breakdown: { batch: { subject: count } } }

    rows.forEach(row =>
      row.forEach(bench =>
        bench.forEach(s => {
          if (!s) return;
          const year = s.year || "UNKNOWN";
          const batch = s.Batch || "UNKNOWN";
          const subject = s.subject || "UNKNOWN";

          tempMap[year] ??= { rolls: [], breakdown: {} };
          tempMap[year].rolls.push(s.RollNumber);
          tempMap[year].breakdown[batch] ??= {};
          tempMap[year].breakdown[batch][subject] = (tempMap[year].breakdown[batch][subject] || 0) + 1;
        })
      )
    );

    for (const [year, yData] of Object.entries(tempMap)) {
      const rolls = yData.rolls.sort();
      const breakdown = yData.breakdown;

      let breakdownStr = Object.entries(breakdown).map(([batch, subjects]) => {
        let subjStr = Object.entries(subjects).map(([subj, count]) => `${subj}: ${count}`).join(", ");
        return `<b>Batch ${batch}</b>: ${subjStr}`;
      }).join("<br>");

      dataByYear[year] ??= [];
      dataByYear[year].push({
        hallName,
        rolls: rolls.join(", "),
        breakdownStr,
        count: rolls.length
      });
    }
  }

  // Generate Year-wise HTML sections
  Object.keys(dataByYear).sort().forEach(year => {
    const displayYear = resolveYearDisplay(year, selectedYears);
    const semLabel = String(displayYear).match(/^\d+$/)
      ? findSem(displayYear, semType)
      : `Year ${displayYear}`;

    html += `
<div class="page-break"></div>

<div style="border: 2px solid #000; padding: 10px; margin-bottom: 20px; background: #f9f9f9;">
  <h1 style="margin:0; font-size: 20px;">College of Engineering Chengannur</h1>
  <h2 style="margin:5px 0; font-size: 18px;">${seriesName || "Hall Allocation Summary"}</h2>
  <h2 style="margin:5px 0; font-size: 18px;">Hall Wise Summary - ${semLabel}</h2>
  <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px;">
    <span>Date: ${datePart}</span>
    <span>Session: ${sessionLabel}</span>
  </div>
</div>

<table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
<thead>
<tr style="background: #333; color: #fff;">
  <th style="width: 15%; border: 1px solid #000; padding: 8px; color: #000;">Hall</th>
  <th style="width: 45%; border: 1px solid #000; padding: 8px; color: #000;">Roll Numbers</th>
  <th style="width: 30%; border: 1px solid #000; padding: 8px; color: #000;">Subjects</th>
  <th style="width: 10%; border: 1px solid #000; padding: 8px; color: #000;">Total</th>
</tr>
</thead>
<tbody>
`;

    dataByYear[year].forEach(h => {
      html += `
<tr>
  <td style="border: 1px solid #000; padding: 10px; text-align: center; font-size: 16px; color: #000;"><b>${h.hallName}</b></td>
  <td style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 13px; color: #000;">${h.rolls}</td>
  <td style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px; color: #000;">${h.breakdownStr}</td>
  <td style="border: 1px solid #000; padding: 10px; text-align: center; font-size: 16px; color: #000;"><b>${h.count}</b></td>
</tr>
`;
    });

    html += `</tbody></table>`;
  });

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
      return badRequest(res, "Exam ID is required to generate the PDF.");
    }

    const ref = db.collection("examAllocations").doc(examId);

    const snap = await ref.get();

    if (!snap.exists) {
      return notFound(res, "Exam allocation was not found.");
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

    const hallHTML = generateHallHTML(allocation, data.examDate, data.semType);
    const summaryHTML = generateSummaryHTML(allocation, data.examDate, data.semType, data.seriesName, data.sems);

    console.log(data.semType);
    
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
    return serverError(res, err, "Failed to generate elective seating PDF.");
  }
});

module.exports = router;

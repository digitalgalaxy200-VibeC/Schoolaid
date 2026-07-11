const fs = require('fs');
const readline = require('readline');

async function testParse() {
  const fileStream = fs.createReadStream('D:\\Web Apps\\WepApps\\Schoool Aid\\backup.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let counts = {
    schools: 0,
    students: 0,
    staff: 0,
    classes: 0,
    subjects: 0,
    assessment_scores: 0
  };

  for await (const line of rl) {
    if (line.startsWith('INSERT INTO "schools"')) counts.schools++;
    else if (line.startsWith('INSERT INTO "students"')) counts.students++;
    else if (line.startsWith('INSERT INTO "staff"')) counts.staff++;
    else if (line.startsWith('INSERT INTO "classes"')) counts.classes++;
    else if (line.startsWith('INSERT INTO "subjects"')) counts.subjects++;
    else if (line.startsWith('INSERT INTO "assessment_scores"')) counts.assessment_scores++;
  }

  console.log("Counts found in file:", counts);
}

testParse();

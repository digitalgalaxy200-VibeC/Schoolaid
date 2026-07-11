const fs = require('fs');

async function extract() {
  const sql = fs.readFileSync('D:/Web Apps/WepApps/Schoool Aid/backup.sql', 'utf8');

  // INSERT INTO "class_teachers" ("id", "school_id", "class_id", "teacher_id", "role"
  const regex = /INSERT INTO "class_teachers" \("id", "school_id", "class_id", "teacher_id", "role"[^\)]*\) VALUES \('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)'/g;
  
  const matches = [...sql.matchAll(regex)];
  const classTeachers = matches.map(m => ({
    id: m[1],
    school_id: m[2],
    class_id: m[3],
    old_teacher_id: m[4],
    role: m[5]
  }));

  console.log('Found ' + classTeachers.length + ' class_teachers in backup.');
  fs.writeFileSync('class_teachers_extracted.json', JSON.stringify(classTeachers, null, 2));
}
extract();

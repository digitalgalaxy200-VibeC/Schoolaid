const fs = require("fs");
let content = fs.readFileSync("src/app/school-admin/teachers/page.tsx", "utf8");

// Find the exact block
const marker = "              render: (t: any) => {\n                const assignments = t.teacher_subjects || [];";
const idx = content.indexOf(marker);
if (idx < 0) { console.log("NOT FOUND"); process.exit(1); }

// Find end of this render function (the closing "}," before next key)
const endMarker = "              }\n            },";
const endIdx = content.indexOf(endMarker, idx);
if (endIdx < 0) { console.log("END NOT FOUND"); process.exit(1); }

const newBlock = `              render: (t: any) => {
                const subjectAssignments = t.teacher_subjects || [];
                const classTeacherAssignments = (t.class_teachers || []).filter((ct: any) => ct.is_active !== false);
                
                // Build class map from teacher_subjects (subject assignments)
                const byClass: Record<string, { name: string; subjects: string[]; role?: string }> = {};
                subjectAssignments.forEach((a: any) => {
                  const cn = a.classes?.name || "Unknown";
                  if (!byClass[cn]) byClass[cn] = { name: cn, subjects: [] };
                  if (a.subjects?.name) byClass[cn].subjects.push(a.subjects.name);
                });

                // Add class_teacher assignments (form tutor)
                classTeacherAssignments.forEach((ct: any) => {
                  const cn = ct.classes?.name || "Unknown";
                  if (!byClass[cn]) byClass[cn] = { name: cn, subjects: [] };
                  if (ct.role === "primary") byClass[cn].role = "primary";
                });

                const classNames = Object.keys(byClass);
                if (!classNames.length) return <span className="text-caption text-text-muted">\u2014</span>;

                const hasPrimary = classTeacherAssignments.some((ct: any) => ct.role === "primary");
                const isClassTeacher = t.designation === "class_teacher" || hasPrimary;

                return (
                  <div>
                    {isClassTeacher ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary-light text-primary">Class Teacher</span>
                    ) : (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">Subject Teacher</span>
                    )}
                    <div className="mt-1 space-y-0.5">
                      {Object.values(byClass).map((c: any, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium">{c.name}</span>
                          {c.role === "primary" && <span className="text-primary ml-1">(Form Tutor)</span>}
                          {c.subjects.length > 0 && (
                            <span className="text-text-muted"> \u2192 {c.subjects.join(", ")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }`;

content = content.substring(0, idx) + newBlock + content.substring(endIdx + 2);
fs.writeFileSync("src/app/school-admin/teachers/page.tsx", content);
console.log("DONE");

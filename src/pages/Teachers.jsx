import React, { useState, useEffect } from "react";
import { loadData, saveData, uid } from "../utils";
import { parseCSV } from "../csv";

const dayNames = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [settings, setSettings] = useState({ timeslots_per_day: 6 });
  const [subjects, setSubjects] = useState([]);

  const emptyForm = {
    id: "",
    teacher_id: "",
    name: "",
    short: "",
    max_per_day: 4,
    subject_id: "",
    unavailable: []
  };

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const d = loadData();
    const loadedTeachers = (d.teachers || []).map(safeTeacher);
    setTeachers(loadedTeachers);
    setSettings(d.settings || { timeslots_per_day: 6 });
    setSubjects(d.subjects || []);
  }, []);

  function persistTeachers(list) {
    const d = loadData();
    d.teachers = list;
    saveData(d);
  }

  function persistSubjects(list) {
    const d = loadData();
    d.subjects = list;
    saveData(d);
  }

  function safeTeacher(t) {
    const short = t.short || autoShortFromName(t.name || "");
    const teacher_id = t.teacher_id || t.id || "";
    return {
      teacher_id,
      max_per_day: t.max_per_day || 4,
      short,
      unavailable: Array.isArray(t.unavailable) ? t.unavailable : [],
      ...t,
      id: t.id || teacher_id || uid("t")
    };
  }

  function autoShortFromName(name) {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) return parts[0]; // ใช้คำแรกเป็นชื่อย่อ
    return name.slice(0, 3);
  }

  function toggleUnavailable(day, slot) {
    const exists = form.unavailable.some(
      (u) => u.day === day && u.slot === slot
    );

    let updated = exists
      ? form.unavailable.filter((u) => !(u.day === day && u.slot === slot))
      : [...form.unavailable, { day, slot }];

    setForm({ ...form, unavailable: updated });
  }

  function handleSave() {
    if (!form.name) return alert("กรุณากรอกชื่อครู");
    if (!form.max_per_day)
      return alert("กรุณาเลือกจำนวนคาบสูงสุดต่อวัน");

    // ป้องกันชื่อครูซ้ำ
    const dupName = teachers.find(
      (t) => t.name.trim() === form.name.trim() && t.id !== form.id
    );
    if (dupName) return alert("มีชื่อครูนี้อยู่ในระบบแล้ว!");

    // กำหนดค่า id / teacher_id / short
    const teacher_id = form.teacher_id || form.id || uid("t");
    const id = form.id || teacher_id;
    const short = form.short || autoShortFromName(form.name);

    const item = safeTeacher({
      ...form,
      id,
      teacher_id,
      short
    });
 console.log("Saving teacher:", item);
    const newList = [
      ...teachers.filter((t) => t.id !== item.id),
      item
    ];

    setTeachers(newList);
    persistTeachers(newList);

    setForm(emptyForm);
    setEditing(false);
  }

  function handleEdit(t) {
    const safe = safeTeacher(t);
    setForm({
      id: safe.id,
      teacher_id: safe.teacher_id,
      name: safe.name,
      short: safe.short,
      max_per_day: safe.max_per_day,
      subject_id: safe.subject_id || "",
      unavailable: safe.unavailable
    });
    setEditing(true);
  }

  function handleDelete(id) {
    if (!confirm("ต้องการลบครูคนนี้ใช่หรือไม่?")) return;
    const list = teachers.filter((t) => t.id !== id);
    setTeachers(list);
    persistTeachers(list);

    // ถ้าลบครูออก อัปเดต subjects เอาครูนี้ออกจากรายวิชาด้วย
    const updatedSubjects = (subjects || []).map((s) => ({
      ...s,
      teachers: (s.teachers || []).filter((tid) => tid !== id)
    }));
    setSubjects(updatedSubjects);
    persistSubjects(updatedSubjects);
  }

  const days = 5;
  const slots = settings.timeslots_per_day || 6;

  /** นำเข้า teacher.csv (จาก pdf: teacher_id,teacher_name) */
function handleFileTeacherCSV(e) {
  const input = e.target;      // ✅ เก็บไว้
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const csvText = ev.target.result;

    parseCSV(csvText, (rows) => {
      console.log("Import teacher.csv rows:", rows);

      const imported = rows
        .map((r) => {
          const name = r.teacher_name || "";
          if (!name) return null;

          const teacher_id = r.teacher_id || uid("t");

          return safeTeacher({
            id: teacher_id,
            teacher_id,
            name,
            short: autoShortFromName(name),
            max_per_day: 4,
            unavailable: []
          });
        })
        .filter(Boolean);

      const merged = [...teachers];

      // รวมแบบไม่ซ้ำ teacher_id + name
      for (const t of imported) {
        const exists = merged.find(
          (x) =>
            (x.teacher_id && x.teacher_id === t.teacher_id) ||
            (x.name.trim() === t.name.trim())
        );
        if (!exists) merged.push(t);
      }

      setTeachers(merged);
      persistTeachers(merged);
      alert("นำเข้าข้อมูล teacher.csv เรียบร้อย");

      input.value = ""; // ✅ reset ได้จริง
    });
  };

  reader.readAsText(file, "utf-8");
}



  /**
   * นำเข้า teach.csv: teacher_id,subject_id
   * - ใช้ teacher_id ไปหา Teacher (จาก teachers)
   * - ใช้ subject_id ไปหา Subject (จาก subjects)
   * - แล้วเพิ่ม teacher.id เข้าไปใน subject.teachers
   * - จากนั้นใช้ subjects นี้ไปแสดง “วิชาที่สอน” ใต้แต่ละครู
   */
function handleImportTeachCSV(e) {
  const input = e.target;              // ✅ เก็บ input ไว้
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (ev) => {
    const csvText = ev.target.result;   // ✅ string

    const d = loadData();
    let currentSubjects = d.subjects || [];
    const currentTeachers = (d.teachers || []).map(safeTeacher);

    parseCSV(csvText, (rows) => {
      let updatedSubjects = [...currentSubjects];
      console.log("Import teach.csv rows:", rows);

      rows.forEach((r) => {
        const teacherCode = (r.teacher_id || "").trim();
        const subjectCode = (r.subject_id || "").trim();
        if (!teacherCode || !subjectCode) return;

        // หา teacher จาก teacher_id หรือ id
        const teacher =
          currentTeachers.find(
            (t) =>
              (t.teacher_id && t.teacher_id === teacherCode) ||
              t.id === teacherCode
          ) || null;
        if (!teacher) return;
        console.log("Found teacher:", teacher);

        // หา subject จาก subject_id หรือ id
        const subjIndex = updatedSubjects.findIndex(
          (s) =>
            (s.subject_id && s.subject_id === subjectCode) ||
            s.id === subjectCode
        );
        if (subjIndex === -1) return;
        console.log("Found subjIndex:", subjIndex);


        const subj = updatedSubjects[subjIndex];
        const teacherList = Array.isArray(subj.teachers)
          ? [...subj.teachers]
          : [];

        if (!teacherList.includes(teacher.id)) {
          teacherList.push(teacher.id);
        }

        updatedSubjects[subjIndex] = {
          ...subj,
          teachers: teacherList
        };
      });

      setSubjects(updatedSubjects);

      // เซฟกลับ localStorage
      d.subjects = updatedSubjects;
      d.teachers = currentTeachers; // เผื่อ safeTeacher ปรับโครง
      saveData(d);

      console.log("Updated data:", d);

      alert("นำเข้า teach.csv (teacher_id,subject_id) เรียบร้อย");
      input.value = "";               // ✅ reset input ได้จริง
    });
  };

  reader.readAsText(file, "utf-8");
}


  // เอาไว้เช็คว่าช่องไหนติ๊กเป็น "ไม่ว่าง"
  function isUnavailable(day, slot) {
    return form.unavailable.some(
      (u) => u.day === day && u.slot === slot
    );
  }

  // คืนรายชื่อวิชาที่ครูคนนี้สอนได้ จาก subjects.teachers
  function getSubjectsOfTeacher(teacherId) {
    const list = (subjects || []).filter((s) =>
      (s.teachers || []).includes(teacherId)
    );
    if (!list.length) return "-";
    // แสดงทั้งรหัสวิชา + ชื่อวิชา ถ้ามี
    return list
      .map((s) => {
        const code = s.subject_id || s.id || "";
        if (code && s.name && code !== s.name) {
          return `${code} – ${s.name}`;
        }
        return s.name || code;
      })
      .join(", ");
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-blue-700 mb-4">จัดการครู</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* FORM */}
        <div className="card p-4">
          <h3 className="font-semibold mb-2">
            {editing ? "แก้ไขครู" : "เพิ่มครูใหม่"}
          </h3>

          {/* ชื่อครู */}
          <input
            className="w-full p-2 border mb-2"
            placeholder="ชื่อครู"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
                short: form.short || autoShortFromName(e.target.value)
              })
            }
          />
          {/* รหัสครู*/}
          <input
            className="w-full p-2 border mb-2"
            placeholder="รหัสครู"
            value={form.teacher_id}
            onChange={(e) =>
              setForm({
                ...form,
                teacher_id: e.target.value,  
              })
            }
          />
          {/* วิชาที่สอน */}
          <div className="mb-3">
            <label className="block mb-1 font-medium">วิชาที่สอน</label>
            <select
              className="w-full p-2 border rounded"
              value={form.subject_id || ""}
              onChange={(e) => {
                const subjectId = e.target.value;
                if (!subjectId) {
                  // ลบวิชาออก
                  setForm({
                    ...form,
                    subject_id: undefined
                  });
                } else {
                  // ถ้าครูมี subject_id แล้ว ให้เพิ่มเข้า subjects[].teachers
                  setForm({
                    ...form,
                    subject_id: subjectId
                  });
                }
              }}
            >
              <option value="">-- เลือกวิชา --</option>
              {subjects.map((s) => {
                const value = s.subject_id || s.id;
                const label = (s.subject_id && s.name && s.subject_id !== s.name) 
                  ? `${s.subject_id} – ${s.name}` 
                  : (s.name || s.subject_id || value);
                return (
                  <option key={s.id} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          {/* ชื่อย่อครู (ยังให้แก้เองได้)
          <input
            className="w-full p-2 border mb-2"
            placeholder="ชื่อย่อ (เช่น ครูเอ)"
            value={form.short}
            onChange={(e) =>
              setForm({
                ...form,
                short: e.target.value
              })
            }
          /> */}

          {/* จำนวนคาบสูงสุดต่อวัน
          <div className="mb-3">
            <label className="block font-semibold mb-1">
              จำนวนคาบสูงสุดที่สอนได้ใน 1 วัน
            </label>
            <select
              className="w-full p-2 border rounded"
              value={form.max_per_day}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_per_day: Number(e.target.value)
                })
              }
            >
              <option value="">-- เลือกจำนวนคาบ --</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} คาบต่อวัน
                </option>
              ))}
            </select>
          </div> */}

          {/* ตารางเวลาที่ไม่ว่าง */}
          <div className="mt-3">
            <div className="font-semibold mb-1">เวลาที่ไม่ว่าง</div>
            <table className="border-collapse border border-slate-400 text-center w-full text-sm">
              <thead>
                <tr>
                  <th className="border p-1 bg-slate-100">วัน / คาบ</th>
                  {Array.from({ length: slots }).map((_, i) => (
                    <th key={i} className="border p-1 bg-slate-100">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: days }).map((_, day) => (
                  <tr key={day}>
                    <td className="border p-1 bg-blue-50">
                      {dayNames[day]}
                    </td>
                    {Array.from({ length: slots }).map((_, slot) => {
                      const selected = isUnavailable(day, slot);
                      return (
                        <td
                          key={slot}
                          onClick={() => toggleUnavailable(day, slot)}
                          className={
                            "border p-2 cursor-pointer " +
                            (selected
                              ? "bg-red-400 text-white"
                              : "bg-white")
                          }
                        >
                          {selected ? "X" : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ปุ่ม */}
          <div className="flex gap-2 mb-3">
            <button className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex-1" onClick={handleSave}>
              {editing ? "✅ บันทึก" : "➕ เพิ่มครู"}
            </button>

            {editing && (
              <button
                className="px-6 py-2 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex-1"
                onClick={() => {
                  setForm(emptyForm);
                  setEditing(false);
                }}
              >
                ❌ ยกเลิก
              </button>
            )}
          </div>

          <label className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 mb-2 cursor-pointer block text-center">
            📂 นำเข้า teacher.csv
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={handleFileTeacherCSV}
            />
          </label>

          <label className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer block text-center">
            📂 นำเข้า teach.csv
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={handleImportTeachCSV}
            />
          </label>
        </div>

        {/* LIST */}
        <div className="card p-4">
          <h3 className="font-semibold mb-3">รายชื่อครู</h3>

          <div className="space-y-2 max-h-96 overflow-auto text-sm">
            {teachers.map((t) => (
              <div
                key={t.id}
                className="p-2 border rounded flex justify-between items-start"
              >
                <div>
                  <div className="font-semibold text-base">
                    {t.name} {t.short && ``}
                  </div>
                  {t.teacher_id && (
                    <div className="text-slate-500 text-xs">
                      รหัสครู: {t.teacher_id}
                    </div>
                  )}

                  <div className="text-slate-500 text-xs mt-1">
                    วิชาที่สอน: {getSubjectsOfTeacher(t.id)}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 bg-yellow-500 text-white rounded"
                    onClick={() => handleEdit(t)}
                  >
                    แก้ไข
                  </button>
                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    onClick={() => handleDelete(t.id)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}

            {teachers.length === 0 && (
              <div className="text-slate-500 text-sm">
                ยังไม่มีครูในระบบ
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

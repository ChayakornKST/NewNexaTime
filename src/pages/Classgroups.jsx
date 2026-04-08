// src/pages/Classgroups.jsx

import React, { useState, useEffect } from "react";
import { loadData, saveData, uid } from "../utils";
import { parseCSV } from "../csv";

export default function ClassGroups() {
  const [departments, setDepartments] = useState([]);
  const [classGroups, setClassGroups] = useState([]);
  const [editing, setEditing] = useState(false);

  const emptyForm = {
    id: "",
    group_id: "",
    name: "",
    department_id: "",
    studentCount: 0,
    advisor: ""
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const d = loadData();
    setDepartments(d.departments || []);
    // เผื่อข้อมูลเก่าไม่มี advisor/group_id จะเติมค่าเริ่มต้นให้
    setClassGroups(
      (d.classGroups || []).map((c) => ({
        group_id: c.group_id || c.id || "",
        advisor: c.advisor || "",
        ...c
      }))
    );
  }, []);

  function persist(list) {
    const d = loadData();
    d.classGroups = list;
    saveData(d);
  }

  function handleSave() {
    if (!form.name) return alert("กรุณากรอกชื่อกลุ่มเรียน");
    // if (!form.department_id) return alert("กรุณาเลือกแผนก");

    const id = form.id || form.group_id || uid("cg");
    const item = {
      ...form,
      id,
      group_id: form.group_id || id
    };

    const newList = [...classGroups.filter((g) => g.id !== item.id), item];

    setClassGroups(newList);
    persist(newList);
    setForm(emptyForm);
    setEditing(false);
  }

  function handleEdit(cg) {
    setForm({
      group_id: cg.group_id || cg.id,
      advisor: cg.advisor || "",
      ...cg
    });
    setEditing(true);
  }

  function handleDelete(id) {
    if (!confirm("ต้องการลบกลุ่มเรียนนี้หรือไม่?")) return;
    const newList = classGroups.filter((c) => c.id !== id);
    setClassGroups(newList);
    persist(newList);
  }

  // ✅ นำเข้า student_groups.csv ตาม pdf:
  // group_id, group_name, student_count, advisor
  function handleImportCSV(e) {
  const input = e.target;           // ✅ เก็บ input
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (ev) => {
    const csvText = ev.target.result;   // ✅ string

    parseCSV(csvText, (rows) => {
      console.log("Import class_groups.csv rows:", rows);

      const imported = rows
        .map((r) => {
          const group_id = (r.group_id || "").trim() || uid("cg");

          const name = (r.group_name || "").trim();
          if (!name) return null; // ❌ ไม่เอากลุ่มที่ไม่มีชื่อ

          return {
            id: group_id,
            group_id,
            name,
            department_id: "",          // ให้ไปเลือกเองใน UI
            studentCount: Number(r.student_count) || 0,
            advisor: (r.advisor || "").trim()
          };
        })
        .filter(Boolean);

      // รวมแบบไม่ซ้ำ group_id หรือ name
      const merged = [...classGroups];

      for (const g of imported) {
        const exists = merged.find(
          (x) =>
            (x.group_id && x.group_id === g.group_id) ||
            x.name === g.name
        );
        if (!exists) merged.push(g);
      }

      setClassGroups(merged);
      persist(merged);

      alert("นำเข้ากลุ่มเรียนแล้ว");
      input.value = "";             // ✅ reset input ได้จริง
    });
  };

  reader.readAsText(file, "utf-8");
}


  return (
    <div>
      <h2 className="text-2xl font-bold text-blue-700 mb-4">จัดการกลุ่มเรียน</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* form */}
        <div className="card p-4">
          <h3 className="font-semibold mb-3">
            {editing ? "แก้ไขกลุ่มเรียน" : "เพิ่มกลุ่มเรียนใหม่"}
          </h3>

          {/* ชื่อกลุ่มเรียน */}
          <div className="mb-3">
            <label className="block mb-1 font-medium">ชื่อกลุ่มเรียน</label>
            <input
              className="w-full p-2 border rounded"
              placeholder="เช่น ปวช.1/1, ปวส.2/3"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value
                })
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              ใช้ชื่อกลุ่มตามทะเบียนจริง เช่น ปวช.1/1, ปวช.2/2 หรือ ปวส.1/3
            </div>
          </div>

          {/* แผนก
          <div className="mb-3">
            <label className="block mb-1 font-medium">แผนกที่สังกัด</label>
            <select
              className="w-full p-2 border rounded"
              value={form.department_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  department_id: e.target.value
                })
              }
            >
              <option value="">-- เลือกแผนก --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              ใช้สำหรับเชื่อมกลุ่มเรียนกับรายวิชาในแผนกนั้น
              และใช้ฟิลเตอร์ตอนสร้างตารางเรียน
            </div>
          </div> */}

          {/* จำนวนผู้เรียน */}
          <div className="mb-3">
            <label className="block mb-1 font-medium">
              จำนวนนักเรียนในกลุ่ม
            </label>
            <input
              type="number"
              className="w-full p-2 border rounded"
              placeholder="เช่น 35"
              value={form.studentCount}
              onChange={(e) =>
                setForm({
                  ...form,
                  studentCount: Number(e.target.value)
                })
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              ระบบจะใช้ตัวเลขนี้ไปตรวจว่าแต่ละห้องเรียนมีความจุ (capacity)
              เพียงพอหรือไม่ ตอนที่ AI เลือกห้องให้กลุ่มนี้
            </div>
          </div>

          {/* ครูที่ปรึกษา (advisor) */}
          <div className="mb-4">
            <label className="block mb-1 font-medium">
              ครูที่ปรึกษา (advisor)
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="เช่น ครูเอ, ครูสุภาดา"
              value={form.advisor}
              onChange={(e) =>
                setForm({
                  ...form,
                  advisor: e.target.value
                })
              }
            />
          </div>

          {/* ปุ่ม */}
          <div className="flex gap-2 mb-3">
            <button className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex-1" onClick={handleSave}>
              {editing ? "✅ บันทึก" : "➕ เพิ่มกลุ่มเรียน"}
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

          <label className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer block text-center">
            📂 นำเข้า student_groups.csv
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={handleImportCSV}
            />
          </label>
        </div>

        {/* list */}
        <div className="card p-4">
          <h3 className="font-semibold mb-3">รายชื่อกลุ่มเรียน</h3>

          <div className="space-y-2 max-h-96 overflow-auto text-sm">
            {classGroups.map((c) => (
              <div
                key={c.id}
                className="p-2 border rounded flex justify-between items-start"
              >
                <div>
                  <div className="font-semibold text-base">{c.name}</div>
                  {c.group_id && (
                    <div className="text-slate-500 text-xs">
                      รหัสกลุ่ม: {c.group_id}
                    </div>
                  )}
                  <div className="text-slate-500">
                    จำนวนนักเรียน: {c.studentCount || 0} คน
                  </div>
                  {c.advisor && (
                    <div className="text-slate-500">
                      ครูที่ปรึกษา: {c.advisor}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 bg-yellow-500 text-white rounded"
                    onClick={() => handleEdit(c)}
                  >
                    แก้ไข
                  </button>
                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    onClick={() => handleDelete(c.id)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}

            {classGroups.length === 0 && (
              <div className="text-slate-500 text-sm">
                ยังไม่มีกลุ่มเรียนในระบบ
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

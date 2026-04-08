import React, { useState, useEffect } from "react";
import { loadData, saveData } from "../utils";

export default function Generate() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState(null);

  const data = loadData();

  const classGroups = data.classGroups || [];
  const rooms = data.rooms || [];
  const subjects = data.subjects || [];
  const teachers = data.teachers || [];
  const groupSubjects = data.groupSubjects || []; // mapping จาก register.csv
  const settings = data.settings || {};

  // -------------------------------
  // แผนก (ใช้แค่ไว้แสดงชื่อใน log)
  let departmentsRaw = data.departments || [];
  if (!departmentsRaw.length && classGroups.length) {
    const deptStrings = Array.from(
      new Set(
        classGroups
          .map((g) =>
            g.department_id ||
            g.department ||
            g.dept ||
            g.program ||
            g.major ||
            g.faculty
          )
          .filter(Boolean)
      )
    );

    departmentsRaw = deptStrings.map((name) => ({
      id: String(name),
      name: String(name),
    }));
  }
  const departments = departmentsRaw;

  function getDeptIdOfGroup(grp) {
    if (!grp) return "";
    return (
      grp.department_id ||
      grp.department ||
      grp.dept ||
      grp.program ||
      grp.major ||
      ""
    );
  }

  function getDeptNameOfGroup(grp) {
    if (!grp) return "";
    if (grp.department_name) return grp.department_name;
    const id = getDeptIdOfGroup(grp);
    const deptObj = departments.find(
      (d) => d.id === id || d.name === id
    );
    return deptObj?.name || id || "";
  }

  // ตั้งค่าพื้นฐานจากหน้า "ตั้งค่า AI"
  const days = settings.days || settings.days_per_week || 5;
  const slots = settings.timeslots_per_day || 8;

  const avoidLunch = settings.avoidLunch ?? true;
  const lunchSlot = settings.lunchSlot ?? 4; // index (0-based) → คาบที่ 5
  const spreadDays = settings.spreadDays ?? true;
  const strictRoomTag = settings.strictRoomTag ?? true;
  const balanceTeachers = settings.balanceTeachers ?? true;

  const [group, setGroup] = useState("");

  useEffect(() => {
    if (data && data.lastResult) setResult(data.lastResult);
  }, []);

  // -------------------------------
  // วิชาของกลุ่ม (ใช้ register.csv ก่อน ถ้าไม่มีค่อย fallback ตามแผนก)
  function getSubjectsForGroup(classGroupObj) {
    if (!classGroupObj) return [];

    const deptId = getDeptIdOfGroup(classGroupObj);

    const groupKey =
      classGroupObj.group_id ||
      classGroupObj.id ||
      classGroupObj.name;

    // ใช้ mapping group_id,subject_id จาก register.csv
    const regs = groupSubjects.filter((gs) => gs.group_id === groupKey);

    if (regs.length > 0) {
      const subjectIds = regs.map((r) => (r.subject_id || "").trim());
      const byRegister = subjects.filter((s) => {
        const sid = (s.subject_id || s.id || "").trim();
        return subjectIds.includes(sid);
      });
      return byRegister;
    }

    // ถ้าไม่มีใน register.csv → ใช้ logic เดิม (วิชาแผนก + ทั่วไป)
    return subjects.filter((s) => {
      if (s.isGeneral) return true;
      if (Array.isArray(s.departments)) {
        return s.departments.includes(deptId);
      }
      return false;
    });
  }

  // -------------------------------
  // ฟังก์ชันช่วย: เช็กครู "ไม่ว่าง"
  function isTeacherUnavailable(teacher, day, startSlot, duration) {
    if (!teacher) return false;
    const dur = duration || 1;
    const endSlot = startSlot + dur - 1;

    function overlap(s1, e1, s2, e2) {
      return !(e1 < s2 || e2 < s1);
    }

    function checkArray(arr) {
      if (!Array.isArray(arr)) return false;
      return arr.some((u) => {
        if (typeof u.day !== "number" || typeof u.slot !== "number")
          return false;
        if (u.day !== day) return false;
        const uDur = u.duration || 1;
        const uEnd = u.slot + uDur - 1;
        return overlap(startSlot, endSlot, u.slot, uEnd);
      });
    }

    if (checkArray(teacher.unavailableSlots)) return true;
    if (checkArray(teacher.unavailable)) return true;

    const matrices = [
      teacher.unavailableMatrix,
      teacher.busyMatrix,
      teacher.busySlots,
    ];
    for (const m of matrices) {
      if (!Array.isArray(m)) continue;
      const row = m[day];
      if (!Array.isArray(row)) continue;
      for (let s = startSlot; s <= endSlot; s++) {
        if (row[s]) return true;
      }
    }

    const busyDays = teacher.busyDays || teacher.unavailableByDay;
    if (busyDays && Array.isArray(busyDays[day])) {
      const arr = busyDays[day];
      for (let s = startSlot; s <= endSlot; s++) {
        if (arr.includes(s)) return true;
      }
    }

    return false;
  }

  // -------------------------------
  // โหลด/คำนวณโหลดสอนครู
  function getTeacherLoad(teacherId, assignments, globalAssignments) {
    if (!teacherId) return 0;
    const all = [...(globalAssignments || []), ...(assignments || [])];
    let load = 0;
    all.forEach((a) => {
      if (a.teacher_id === teacherId) {
        load += a.duration || 1;
      }
    });
    return load;
  }

  function chooseTeacher(possibleTeachers, assignments, globalAssignments) {
    if (!possibleTeachers.length) return null;

    if (!balanceTeachers) {
      return possibleTeachers[
        Math.floor(Math.random() * possibleTeachers.length)
      ];
    }

    let best = [];
    let bestLoad = Infinity;
    possibleTeachers.forEach((t) => {
      const load = getTeacherLoad(t.id, assignments, globalAssignments);
      if (load < bestLoad) {
        bestLoad = load;
        best = [t];
      } else if (load === bestLoad) {
        best.push(t);
      }
    });

    return best[Math.floor(Math.random() * best.length)];
  }

  // -------------------------------
  // โหลดคาบต่อวันของกลุ่ม (ใช้กับ spreadDays)
  function buildDayLoadForGroup(groupName, assignments, globalAssignments) {
    const counts = new Array(days).fill(0);
    const all = [...(globalAssignments || []), ...(assignments || [])];

    all.forEach((a) => {
      if (a.class_group !== groupName) return;
      if (typeof a.day !== "number") return;
      if (a.day < 0 || a.day >= days) return;
      counts[a.day] += a.duration || 1;
    });

    return counts;
  }

  function pickDayOrderForGroup(groupName, assignments, globalAssignments) {
    if (!spreadDays) {
      return [...Array(days).keys()];
    }

    const loads = buildDayLoadForGroup(groupName, assignments, globalAssignments);
    const indices = [...Array(days).keys()];
    indices.sort((a, b) => loads[a] - loads[b]); // วันคาบน้อยก่อน
    return indices;
  }

  // -------------------------------
  // จับคู่ห้องตาม TAG / room_type (ไม่สนใจ capacity แล้ว)
  function matchRooms(subj) {
    const hasTag = subj.room_tag && subj.room_tag.trim() !== "";

    if (hasTag) {
      const tag = subj.room_tag.trim().toLowerCase();

      const tagged = rooms.filter(
        (r) =>
          r.room_tag &&
          r.room_tag.trim().toLowerCase() === tag
      );

      if (tagged.length > 0) {
        return tagged;
      }

      if (strictRoomTag) {
        setLog(
          (prev) =>
            prev +
            `\n⚠ วิชา ${subj.name} มี room_tag="${subj.room_tag}" แต่ไม่มีห้องที่ room_tag ตรงกัน`
        );
        return [];
      }
    }

    let result = [];

    if (subj.room_type && subj.room_type.trim() !== "") {
      result = rooms.filter((r) => r.room_type === subj.room_type);
    }

    if (result.length === 0) {
      result = rooms;
    }

    return result;
  }

  // -------------------------------
  // ปุ่มเคลียร์ตารางทั้งหมด
  function clearAllTables() {
    if (
      !window.confirm(
        "ต้องการลบตารางเรียนทั้งหมดของทุกกลุ่มเรียนหรือไม่?"
      )
    ) {
      return;
    }

    const d = loadData();
    d.allTimetables = {};
    saveData(d);

    setResult(null);
    setLog("✔ เคลียร์ตารางทั้งหมดเรียบร้อยแล้ว!");
  }

  // -------------------------------
  // sort วิชาตามความยากในการจัดคาบ (ไม่ใช้ capacity แล้ว)
  function sortSessionsWithHeuristic(subjectSessions) {
    return [...subjectSessions].sort((a, b) => {
      const durA = a.periods_per_session || 1;
      const durB = b.periods_per_session || 1;

      const teacherChoicesA = a.teachers?.length || teachers.length;
      const teacherChoicesB = b.teachers?.length || teachers.length;

      const roomsA = matchRooms(a).length || 999;
      const roomsB = matchRooms(b).length || 999;

      const scoreA = durA * 100 - teacherChoicesA * 5 - roomsA;
      const scoreB = durB * 100 - teacherChoicesB * 5 - roomsB;

      return scoreB - scoreA;
    });
  }

  // -------------------------------
  // helper หลัก: พยายามวาง 1 session ของวิชาในกลุ่มที่กำหนด
  function placeOneSession({
    subj,
    groupName,
    currentClassGroup,
    assignments,
    globalAssignments,
    possibleRooms,
    possibleTeachers,
  }) {
    const duration = subj.periods_per_session || 1;
    const dayOrder = pickDayOrderForGroup(groupName, assignments, globalAssignments);

    // 2 pass: pass0 หลีกเลี่ยงพักเที่ยง, pass1 ยอมใช้ได้
    for (let pass = 0; pass < 2; pass++) {
      const allowLunchThisPass = pass === 1 || !avoidLunch;

      for (const day of dayOrder) {
        for (let startSlot = 0; startSlot <= slots - duration; startSlot++) {
          if (!allowLunchThisPass && avoidLunch && startSlot === lunchSlot) {
            continue;
          }

          // เลือกครูตาม balance
          const teacher = chooseTeacher(possibleTeachers, assignments, globalAssignments);
          if (!teacher) continue;

          if (isTeacherUnavailable(teacher, day, startSlot, duration)) {
            continue;
          }

          // ครูชน?
          const teacherBusy =
            globalAssignments.some(
              (a) =>
                a.teacher_id === teacher.id &&
                a.day === day &&
                ((startSlot >= a.slot &&
                  startSlot < a.slot + a.duration) ||
                  (a.slot >= startSlot &&
                    a.slot < startSlot + duration))
            ) ||
            assignments.some(
              (a) =>
                a.teacher_id === teacher.id &&
                a.day === day &&
                ((startSlot >= a.slot &&
                  startSlot < a.slot + a.duration) ||
                  (a.slot >= startSlot &&
                    a.slot < startSlot + duration))
            );
          if (teacherBusy) continue;

          // กลุ่มชน?
          const classBusy = assignments.some(
            (a) =>
              a.class_group === groupName &&
              a.day === day &&
              ((startSlot >= a.slot &&
                startSlot < a.slot + a.duration) ||
                (a.slot >= startSlot &&
                  a.slot < startSlot + duration))
          );
          if (classBusy) continue;

          for (const room of possibleRooms) {
            const roomBusy =
              globalAssignments.some(
                (a) =>
                  a.room_id === room.id &&
                  a.day === day &&
                  ((startSlot >= a.slot &&
                    startSlot < a.slot + a.duration) ||
                    (a.slot >= startSlot &&
                      a.slot < startSlot + a.duration))
              ) ||
              assignments.some(
                (a) =>
                  a.room_id === room.id &&
                  a.day === day &&
                  ((startSlot >= a.slot &&
                    startSlot < a.slot + a.duration) ||
                    (a.slot >= startSlot &&
                      a.slot < startSlot + a.duration))
              );
            if (roomBusy) continue;

            const assignment = {
              course_id: subj.id,
              course_code: subj.subject_id || subj.id,
              course_name: subj.name,
              teacher_id: teacher.id,
              teacher_code: teacher.teacher_id || teacher.id,
              teacher_name: teacher.name,
              room_id: room.id,
              room_code: room.room_id || room.id,
              room_name: room.name,
              class_group: groupName,
              class_group_id:
                currentClassGroup?.group_id || currentClassGroup?.id,
              day,
              slot: startSlot,
              duration,
              color: subj.color,
            };

            assignments.push(assignment);
            globalAssignments && globalAssignments.push(assignment);

            return true; // วางสำเร็จ
          }
        }
      }
    }

    return false; // วางไม่สำเร็จ
  }

  // -------------------------------
  // สร้างตารางของ "กลุ่มเดียว"
  async function runLocalSolver() {
    if (!group) return alert("กรุณาเลือกกลุ่มเรียน");

    const currentClassGroup = classGroups.find((c) => c.name === group);
    const groupSize = currentClassGroup?.studentCount || 0; // ใช้แค่ไว้ log
    const deptName = getDeptNameOfGroup(currentClassGroup) || "ไม่ระบุแผนก";

    const start = performance.now();

    const d0 = loadData();
    const allTables = d0.allTimetables || {};

    const globalAssignments = [];
    for (const gName in allTables) {
      if (gName === group) continue;
      const arr = allTables[gName] || [];
      globalAssignments.push(...arr);
    }

    setRunning(true);
    setLog(
      `เริ่มสร้างตารางให้แผนก: ${deptName} | กลุ่ม: ${group} ` +
        `(นักเรียน: ${groupSize || "ไม่ระบุ"})`
    );

    const assignments = [];
    const subjectSessions = [];

    const groupSubjectList = getSubjectsForGroup(currentClassGroup);

    groupSubjectList.forEach((s) => {
      const total = s.periods || 1;
      const per = s.periods_per_session || 1;
      const count = Math.ceil(total / per);
      for (let i = 0; i < count; i++) {
        subjectSessions.push({ ...s });
      }
    });

    const orderedSessions = sortSessionsWithHeuristic(subjectSessions);

    for (const subj of orderedSessions) {
      const possibleRooms = matchRooms(subj);

      if (possibleRooms.length === 0) {
        setLog(
          (prev) =>
            prev +
            `\n⚠ ไม่มีห้อง (ตาม TAG/ประเภท) สำหรับวิชา ${subj.name}`
        );
        continue;
      }

      const possibleTeachers = subj.teachers?.length
        ? teachers.filter((t) => subj.teachers.includes(t.id))
        : teachers;

      if (!possibleTeachers.length) {
        setLog(
          (prev) => prev + `\n⚠ วิชา ${subj.name} ไม่มีครู`
        );
        continue;
      }

      const ok = placeOneSession({
        subj,
        groupName: group,
        currentClassGroup,
        assignments,
        globalAssignments,
        possibleRooms,
        possibleTeachers,
      });

      if (!ok) {
        setLog(
          (prev) =>
            prev +
            `\n❌ วางวิชา ${subj.name} ไม่สำเร็จ (อาจติดครู/ห้อง/กลุ่มแน่นเกินไป)`
        );
      }
    }

    const d = loadData();
    if (!d.allTimetables) d.allTimetables = {};
    d.allTimetables[group] = assignments;
    saveData(d);

    setResult({ group, assignments });

    const end = performance.now();
    const sec = ((end - start) / 1000).toFixed(2);

    setRunning(false);
    setLog(
      (prev) =>
        prev +
        `\n✔ สร้างตารางเสร็จแล้ว! แผนก: ${deptName} | กลุ่ม: ${group} (ใช้เวลา ${sec} วินาที)`
    );
  }

  // -------------------------------
  // สร้างตารางทั้งหมดทุกกลุ่ม
  async function generateAll() {
    if (
      !window.confirm(
        "ต้องการสร้างตารางใหม่สำหรับทุกกลุ่มเรียนหรือไม่? (ตารางเดิมจะถูกเขียนทับ)"
      )
    ) {
      return;
    }

    const globalStart = performance.now();

    setRunning(true);
    setLog("เริ่มสร้างตารางทั้งหมดสำหรับทุกกลุ่มเรียน...\n");

    const d = loadData();
    d.allTimetables = {};
    saveData(d);

    const allGroups = classGroups;
    const globalAssignments = [];

    for (const grp of allGroups) {
      const grpName = grp.name;
      const deptName = getDeptNameOfGroup(grp) || "ไม่ระบุแผนก";
      const groupSize = grp.studentCount || 0;

      setLog(
        (prev) =>
          prev +
          `\n▶ กำลังสร้างตารางให้กลุ่ม ${grpName} (แผนก: ${deptName}, นักเรียน: ${
            groupSize || "ไม่ระบุ"
          })`
      );

      const groupSubjectList = getSubjectsForGroup(grp);

      const subjectSessions = [];
      groupSubjectList.forEach((s) => {
        const total = s.periods || 1;
        const per = s.periods_per_session || 1;
        const count = Math.ceil(total / per);
        for (let i = 0; i < count; i++) {
          subjectSessions.push({ ...s });
        }
      });

      const orderedSessions = sortSessionsWithHeuristic(subjectSessions);
      const assignments = [];

      for (const subj of orderedSessions) {
        const possibleRooms = matchRooms(subj);
        if (possibleRooms.length === 0) {
          setLog(
            (prev) =>
              prev +
              `\n⚠ กลุ่ม ${grpName}: ไม่มีห้องสำหรับวิชา ${subj.name}`
          );
          continue;
        }

        const possibleTeachers = subj.teachers?.length
          ? teachers.filter((t) => subj.teachers.includes(t.id))
          : teachers;

        if (!possibleTeachers.length) {
          setLog(
            (prev) =>
              prev +
              `\n⚠ กลุ่ม ${grpName}: วิชา ${subj.name} ไม่มีครู`
          );
          continue;
        }

        const ok = placeOneSession({
          subj,
          groupName: grpName,
          currentClassGroup: grp,
          assignments,
          globalAssignments,
          possibleRooms,
          possibleTeachers,
        });

        if (!ok) {
          setLog(
            (prev) =>
              prev +
              `\n❌ กลุ่ม ${grpName}: วางวิชา ${subj.name} ไม่สำเร็จ (อาจติดครู/ห้อง/กลุ่มแน่นเกินไป)`
          );
        }
      }

      const dNow = loadData();
      if (!dNow.allTimetables) dNow.allTimetables = {};
      dNow.allTimetables[grpName] = assignments;
      saveData(dNow);

      setLog(
        (prev) =>
          prev +
          `\n✔ เสร็จสิ้นการสร้างตาราง: แผนก ${deptName} | กลุ่ม ${grpName}`
      );
    }

    const globalEnd = performance.now();
    const secAll = ((globalEnd - globalStart) / 1000).toFixed(2);

    setRunning(false);
    setLog(
      (prev) =>
        prev +
        `\n\n🎉 สร้างตารางทั้งหมดสำหรับทุกกลุ่มเรียน เรียบร้อยแล้ว! (ใช้เวลา ${secAll} วินาที)`
    );
  }

  // -------------------------------
  // UI
  return (
    <div>
      <h2 className="text-2xl font-bold text-blue-700 mb-4">
        สร้างตารางเรียน
      </h2>

      <div className="card p-4 space-y-4">
        <select
          className="border p-3 rounded-lg"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">-- เลือกกลุ่มเรียน --</option>
          {classGroups.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>

        {/* สร้างตารางเฉพาะกลุ่ม */}
        <button
          className="btn bg-blue-600 w-full"
          disabled={running}
          onClick={runLocalSolver}
        >
          {running ? "กำลังสร้าง..." : "สร้างตาราง (เฉพาะกลุ่มนี้)"}
        </button>

        {/* สร้างตารางทั้งหมดทุกกลุ่ม */}
        <button
          className="btn bg-emerald-600 w-full"
          disabled={running}
          onClick={generateAll}
        >
          {running ? "กำลังสร้างทั้งหมด..." : "สร้างตารางทั้งหมด (ทุกกลุ่ม)"}
        </button>

        {/* เคลียร์ตารางทั้งหมด */}
        <button
          className="btn bg-red-600 w-full"
          onClick={clearAllTables}
        >
          เคลียร์ตารางทั้งหมด
        </button>

        <pre className="bg-gray-100 p-2 rounded h-40 overflow-auto text-sm whitespace-pre-wrap">
          {log}
        </pre>
      </div>
    </div>
  );
}

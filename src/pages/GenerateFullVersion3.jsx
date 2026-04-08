import React, { useState, useEffect } from "react";
import { loadData, saveData } from "../utils";

/**
 * =========================================================
 *  Generate.jsx
 * ---------------------------------------------------------
 *  หน้าสร้างตารางเรียน (Scheduling Engine)
 *
 *  ความสามารถ:
 *   - สร้างตารางเฉพาะ 1 กลุ่มเรียน
 *   - สร้างตารางทุกกลุ่มเรียนทั้งวิทยาลัย
 *   - เคลียร์ตารางเรียนทั้งหมด
 *
 *  แนวคิดหลัก:
 *   - ใช้ Heuristic Scheduling
 *   - แตกวิชาเป็น session
 *   - วาง session ทีละอัน
 *   - กันชน ครู / ห้อง / กลุ่ม / คาบพัก
 * =========================================================
 */

export default function Generate() {

  /* ======================================================
   *  STATE (React)
   * ====================================================== */

  // กำลังประมวลผลอยู่หรือไม่ (ป้องกันกดซ้ำ)
  const [running, setRunning] = useState(false);

  // log แสดงขั้นตอนการทำงาน (สำหรับครู / กรรมการดู)
  const [log, setLog] = useState("");

  // ผลลัพธ์ตารางล่าสุด
  const [result, setResult] = useState(null);

  // กลุ่มเรียนที่เลือกจาก dropdown
  const [group, setGroup] = useState("");

  /* ======================================================
   *  LOAD DATA จาก localStorage
   * ====================================================== */

  const data = loadData();

  console.log("DEBUG: loadData()", data);

  const classGroups = data.classGroups || [];
  const departments = data.departments || [];
  const rooms = data.rooms || [];
  const subjects = data.subjects || [];
  const teachers = data.teachers || [];
  const settings = data.settings || {};

  /* ======================================================
   *  SETTINGS (จากหน้า AI Settings)
   * ====================================================== */

  const days = settings.days || 5;
  const slots = settings.timeslots_per_day || 8;

  const strictAvoidLunch = settings.strictAvoidLunch ?? false;
  const avoidLunch = settings.avoidLunch ?? true;
  const lunchSlot = settings.lunchSlot ?? 4; // 0-based
  const spreadDays = settings.spreadDays ?? true;
  const balanceTeachers = settings.balanceTeachers ?? true;

  console.log("DEBUG: settings", {
    days,
    slots,
    strictAvoidLunch,
    avoidLunch,
    lunchSlot,
    spreadDays,
    balanceTeachers
  });

  const filteredGroups = classGroups;

  /* ======================================================
   *  โหลดผลลัพธ์ล่าสุด (ถ้ามี)
   * ====================================================== */

  useEffect(() => {
    if (data?.lastResult) {
      console.log("DEBUG: load lastResult", data.lastResult);
      setResult(data.lastResult);
    }
  }, []);

  /* ======================================================
   *  SUBJECT FILTER
   * ====================================================== */

  /**
   * กรองรายวิชาที่ "กลุ่มเรียนนี้ลงทะเบียน"
   * ใช้ mapping groupSubjects (group_id <-> subject_id)
   */
  function filterSubjectsForGroup(groupName) {
    console.log("DEBUG: filterSubjectsForGroup()", groupName);

    if (!groupName) return subjects;

    const reg = Array.isArray(data.groupSubjects)
      ? data.groupSubjects
      : [];

    if (!reg.length) {
      console.warn("DEBUG: no groupSubjects mapping");
      return [];
    }

    const classGroup = classGroups.find(cg => cg.name === groupName);
    if (!classGroup) {
      console.warn("DEBUG: classGroup not found", groupName);
      return [];
    }

    const result = subjects.filter(s =>
      reg.some(r =>
        r.group_id === classGroup.group_id &&
        r.subject_id === s.subject_id
      )
    );

    console.log("DEBUG: filtered subjects", result);
    return result;
  }

  /* ======================================================
   *  HEURISTIC SORT
   * ====================================================== */

  /**
   * เรียง session จาก "ยาก → ง่าย"
   * เพื่อเพิ่มโอกาสวางสำเร็จ
   */
  function sortSessionsWithHeuristic(sessions) {
    console.log("DEBUG: sortSessionsWithHeuristic()", sessions);

    return sessions
      .map(s => {
        const duration = s.periods_per_session || 1;
        const teacherCount = s.teachers?.length ?? teachers.length;
        const roomCount = matchRooms(s).length || 999;

        const score = duration * 100 - teacherCount * 5 - roomCount;

        return { ...s, __score: score };
      })
      .sort((a, b) => b.__score - a.__score)
      .map(({ __score, ...rest }) => rest);
  }

  /* ======================================================
   *  TEACHER HELPERS
   * ====================================================== */

  function isTeacherUnavailable(teacher, day, startSlot, duration) {
    if (!teacher) return false;

    const endSlot = startSlot + duration - 1;

    return Array.isArray(teacher.unavailable) &&
      teacher.unavailable.some(u =>
        u.day === day &&
        !(endSlot < u.slot || u.slot + (u.duration || 1) - 1 < startSlot)
      );
  }

  function getTeacherLoad(teacherId, assignments, globalAssignments) {
    return [...globalAssignments, ...assignments]
      .filter(a => a.teacher_id === teacherId)
      .reduce((sum, a) => sum + (a.duration || 1), 0);
  }

  function chooseTeacher(possible, assignments, globalAssignments) {
    if (!possible.length) return null;

    if (!balanceTeachers) {
      return possible[Math.floor(Math.random() * possible.length)];
    }

    let bestLoad = Infinity;
    let best = [];

    possible.forEach(t => {
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

  /* ======================================================
   *  DAY PICKER
   * ====================================================== */

  function buildDayLoadForGroup(groupName, assignments, globalAssignments) {
    const load = new Array(days).fill(0);

    [...globalAssignments, ...assignments].forEach(a => {
      if (a.class_group === groupName) {
        load[a.day] += a.duration || 1;
      }
    });

    console.log("DEBUG: dayLoad", groupName, load);
    return load;
  }

  function pickDayForGroup(groupName, assignments, globalAssignments) {
    if (!spreadDays) {
      return Math.floor(Math.random() * days);
    }

    const loads = buildDayLoadForGroup(groupName, assignments, globalAssignments);
    const indices = [...Array(days).keys()].sort((a, b) => loads[a] - loads[b]);

    const pickCount = Math.max(1, Math.ceil(days / 2));
    const chosen = indices[Math.floor(Math.random() * pickCount)];

    console.log("DEBUG: pickDay", { groupName, loads, chosen });
    return chosen;
  }

  //คำนวณจำนวนคาบที่ใช้ไปแล้วของกลุ่มในวันนั้น
  function getUsedSlotsForDay(groupName, day, assignments, globalAssignments) {
    const all = [...(globalAssignments || []), ...(assignments || [])];

    return all
      .filter(a => a.class_group === groupName && a.day === day)
      .reduce((sum, a) => sum + (a.duration || 1), 0);
  }


  /* ======================================================
   *  ROOM MATCHING
   * ====================================================== */

  function matchRooms(subj) {
    console.log("DEBUG: matchRooms()", subj.name);
    // ปรับปรุงภายหลังตามประเภทห้อง / ขนาดห้อง / tag  -> ใส่โค้ดที่นี่
    return rooms;
  }

  function generateDurationCandidates(totalPeriods) {
    const result = [];
    let d = totalPeriods;

    while (d >= 1) {
      result.push(d);
      if (d === 1) break;
      d = Math.floor(d / 2);
    }

    return result;
  }



  function validateAssignments(assignments, settings) {
    const errors = [];

    const {
      slots,
      lunchSlot,
      avoidLunch,
      strictAvoidLunch
    } = settings;

    // helper: ตรวจชนช่วงเวลา
    const overlap = (s1, d1, s2, d2) =>
      !(s1 + d1 <= s2 || s2 + d2 <= s1);

    // --- 1. ตรวจ slot + duration ---
    assignments.forEach(a => {
      if (a.slot + a.duration > slots) {
        errors.push({
          type: "OUT_OF_RANGE",
          message: `❌ ${a.course_name} (${a.class_group}) คาบเกินวัน: slot ${a.slot} + duration ${a.duration} > ${slots}`
        });
      }
    });

    // --- 2. ตรวจชนพักกลางวัน ---
    assignments.forEach(a => {
      const hitsLunch =
        a.slot <= lunchSlot &&
        a.slot + a.duration > lunchSlot;

      if (
        hitsLunch &&
        (strictAvoidLunch || avoidLunch)
      ) {
        errors.push({
          type: "LUNCH_CONFLICT",
          message: `⚠️ ${a.course_name} (${a.class_group}) ชนคาบพักกลางวัน`
        });
      }
    });

    // --- 3. ตรวจชนกัน (กลุ่ม / ครู / ห้อง) ---
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i];
        const b = assignments[j];

        if (a.day !== b.day) continue;
        if (!overlap(a.slot, a.duration, b.slot, b.duration)) continue;

        if (a.class_group === b.class_group) {
          errors.push({
            type: "CLASS_OVERLAP",
            message: `❌ กลุ่ม ${a.class_group} มีคาบชน: ${a.course_name} ↔ ${b.course_name}`
          });
        }

        if (a.teacher_id === b.teacher_id) {
          errors.push({
            type: "TEACHER_OVERLAP",
            message: `❌ ครู ${a.teacher_name} สอนชนเวลา: ${a.course_name} ↔ ${b.course_name}`
          });
        }

        if (a.room_id === b.room_id) {
          errors.push({
            type: "ROOM_OVERLAP",
            message: `❌ ห้อง ${a.room_name} ถูกใช้ซ้อน: ${a.course_name} ↔ ${b.course_name}`
          });
        }
      }
    }

    return errors;
  }


  /* ======================================================
   *  CORE ENGINE
   * ====================================================== */

  function prepareGroupContext(grp) {
    const dept = departments.find(d => d.id === grp.department_id);

    const ctx = {
      groupName: grp.name,
      deptName: dept?.name || "",
      groupSize: grp.studentCount || 0
    };

    console.log("DEBUG: prepareGroupContext()", ctx);
    return ctx;
  }

  function buildSubjectSessionsForGroup(groupName) {
    const subs = filterSubjectsForGroup(groupName);
    const sessions = [];

    subs.forEach(s => {
      const total = s.periods || 1;
      const per = s.periods_per_session || 1;
      const count = Math.ceil(total / per);

      for (let i = 0; i < count; i++) {
        sessions.push({ ...s });
      }
    });

    console.log("DEBUG: subjectSessions", groupName, sessions);
    return sortSessionsWithHeuristic(sessions);
  }

  /**
   * ------------------------------------------------------
   * ENGINE หลัก: สร้างตารางให้ 1 กลุ่มเรียน
   * ------------------------------------------------------
   */
  function isTeacherBusy(
    teacherId,
    day,
    startSlot,
    duration,
    localAssignments = [],
    globalAssignments = []
  ) {
    const all = [...localAssignments, ...globalAssignments];

    return all.some(a => {
      if (a.teacher_id !== teacherId) return false;
      if (a.day !== day) return false;

      const aStart = a.slot;
      const aEnd = a.slot + a.duration;

      const bStart = startSlot;
      const bEnd = startSlot + duration;

      // overlap check
      return !(bEnd <= aStart || bStart >= aEnd);
    });
  }

  function isRoomBusy(
    roomId,
    day,
    startSlot,
    duration,
    localAssignments = [],
    globalAssignments = []
  ) {
    const all = [...localAssignments, ...globalAssignments];

    return all.some(a => {
      if (a.room_id !== roomId) return false;
      if (a.day !== day) return false;

      const aStart = a.slot;
      const aEnd = a.slot + a.duration;

      const bStart = startSlot;
      const bEnd = startSlot + duration;

      return !(bEnd <= aStart || bStart >= aEnd);
    });
  }

  function isClassBusy(
    groupName,
    day,
    startSlot,
    duration,
    localAssignments = []
  ) {
    return localAssignments.some(a => {
      if (a.class_group !== groupName) return false;
      if (a.day !== day) return false;

      const aStart = a.slot;
      const aEnd = a.slot + a.duration;

      const bStart = startSlot;
      const bEnd = startSlot + duration;

      return !(bEnd <= aStart || bStart >= aEnd);
    });
  }

  // function generateScheduleForOneGroup(ctx, sessions, globalAssignments) {
  //   console.log("========== START generateScheduleForOneGroup ==========");
  //   console.log("CTX:", ctx);
  //   console.log("Total sessions:", sessions.length);

  //   setLog(prev =>
  //     prev +
  //     `\n\n▶ เริ่มสร้างตารางกลุ่ม ${ctx.groupName} (${sessions.length} sessions)`
  //   );

  //   const assignments = [];

  //   // 🆕 buffer สำหรับ rollback ทั้งวิชา
  //   const tempAssignments = [];

  //   for (const subj of sessions) {
  //     console.log("---- Subject ----", subj.name);

  //     // 🔴 ของเดิม
  //     const totalPeriods = subj.periods_per_session || 1;
  //     const durationCandidates = generateDurationCandidates(totalPeriods);

  //     // 🆕 คาบรวมจริงของวิชา
  //     const originalPeriods = subj.periods || totalPeriods;
  //     let remainingPeriods = originalPeriods;

  //     console.log(
  //       "DEBUG: durationCandidates",
  //       subj.name,
  //       durationCandidates
  //     );

  //     let placedAnything = false;

  //     // ❗ ตัดกรณีที่มากกว่าคาบต่อวันตั้งแต่ต้น (เดิม)
  //     if (totalPeriods > slots) {
  //       const msg =
  //         `❌ ${subj.name}: ใช้ ${totalPeriods} คาบ > คาบต่อวัน (${slots})`;
  //       console.warn(msg);
  //       setLog(prev => prev + "\n" + msg);
  //       continue;
  //     }

  //     // 🔁 แตก session จนคาบครบ
  //     while (remainingPeriods > 0) {

  //       let placed = false;

  //       // 🔁 ลองแต่ละ duration (ของเดิม)
  //       for (const duration of durationCandidates) {
  //         if (placed) break;
  //         if (duration > remainingPeriods) continue;

  //         const isSplit = duration < totalPeriods;

  //         if (isSplit) {
  //           console.log(
  //             `DEBUG: trying split duration ${duration} for ${subj.name}`
  //           );
  //           setLog(prev =>
  //             prev +
  //             `\n↪ ทดลองแบ่งคาบ ${subj.name} เหลือ ${duration} คาบ/ครั้ง | จากเดิม ${totalPeriods} คาบ`
  //           );
  //         }

  //         for (let pass = 0; pass < 2 && !placed; pass++) {
  //           const allowLunch = pass === 1 || !avoidLunch;

  //           for (let attempt = 0; attempt < 500 && !placed; attempt++) {

  //             // ---------- logic เดิมทั้งหมด ----------
  //             const day = pickDayForGroup(
  //               ctx.groupName,
  //               assignments,
  //               globalAssignments
  //             );

  //             const usedSlots = getUsedSlotsForDay(
  //               ctx.groupName,
  //               day,
  //               assignments,
  //               globalAssignments
  //             );

  //             if (usedSlots + duration > slots) continue;

  //             const startSlot = Math.floor(
  //               Math.random() * (slots - duration + 1)
  //             );

  //             const hitsLunch =
  //               startSlot <= lunchSlot &&
  //               startSlot + duration > lunchSlot;

  //             if (strictAvoidLunch && hitsLunch) continue;
  //             if (!allowLunch && avoidLunch && hitsLunch) continue;

  //             const selectedTeachers = subj.teachers?.length
  //               ? teachers.filter(t => subj.teachers.includes(t.id))
  //               : teachers;

  //             const teacher = chooseTeacher(
  //               selectedTeachers,
  //               assignments,
  //               globalAssignments
  //             );
  //             if (!teacher) continue;

  //             if (isTeacherUnavailable(teacher, day, startSlot, duration)) continue;

  //             const room = rooms[Math.floor(Math.random() * rooms.length)];

  //             if (
  //               isTeacherBusy(
  //                 teacher.id,
  //                 day,
  //                 startSlot,
  //                 duration,
  //                 assignments,
  //                 globalAssignments
  //               ) ||
  //               isRoomBusy(
  //                 room.id,
  //                 day,
  //                 startSlot,
  //                 duration,
  //                 assignments,
  //                 globalAssignments
  //               ) ||
  //               isClassBusy(
  //                 ctx.groupName,
  //                 day,
  //                 startSlot,
  //                 duration,
  //                 assignments
  //               )
  //             ) {
  //               continue;
  //             }

  //             const newAssignment = {
  //               course_id: subj.id,
  //               course_name: subj.name,
  //               teacher_id: teacher.id,
  //               teacher_name: teacher.name,
  //               room_id: room.id,
  //               room_name: room.name,
  //               class_group: ctx.groupName,
  //               day,
  //               slot: startSlot,
  //               duration,
  //               originalDuration: originalPeriods,
  //               color: subj.color
  //             };

  //             assignments.push(newAssignment);

  //             const errors = validateAssignments(assignments, {
  //               slots,
  //               lunchSlot,
  //               avoidLunch,
  //               strictAvoidLunch
  //             });

  //             if (errors.length > 0) {
  //               assignments.pop();
  //               continue;
  //             }

  //             globalAssignments.push(newAssignment);
  //             placed = true;
  //             placedAnything = true;

  //             // 🆕 สำคัญมาก
  //             remainingPeriods -= duration;
  //           }
  //         }
  //       }

  //       // ❌ ถ้า loop นี้วางไม่ได้เลย → ออก
  //       if (!placed) break;
  //     }

  //     // 🆕 log ใหม่ (ไม่กระทบเดิม)
  //     if (remainingPeriods > 0) {
  //       setLog(prev =>
  //         prev +
  //         `\n⚠ วิชา ${subj.name} ลงไม่ครบ ` +
  //         `${originalPeriods - remainingPeriods}/${originalPeriods} คาบ `
  //       );
  //     } else if (placedAnything) {
  //       setLog(prev =>
  //         prev +
  //         `\n✔ วิชา ${subj.name} ลงครบ ${originalPeriods} คาบ ✅`
  //       );
  //     }
  //   }

  //   console.log("========== END generateScheduleForOneGroup ==========");
  //   return assignments;
  // }

  function generateScheduleForOneGroup(ctx, sessions, globalAssignments) {
    console.log("========== START generateScheduleForOneGroup ==========");
    console.log("CTX:", ctx);
    console.log("Total sessions:", sessions.length);

    setLog(prev =>
      prev +
      `\n\n▶ เริ่มสร้างตารางกลุ่ม ${ctx.groupName} (${sessions.length} sessions)`
    );

    const assignments = [];

    for (const subj of sessions) {
      console.log("---- Subject ----", subj.name);

      // 🔴 ของเดิม
      const totalPeriods = subj.periods_per_session || 1;
      const durationCandidates = generateDurationCandidates(totalPeriods);

      // 🔴 คาบรวมจริงของวิชา
      const originalPeriods = subj.periods || totalPeriods;
      let remainingPeriods = originalPeriods;

      let placedAnything = false;

      // 🆕 buffer สำหรับ rollback "เฉพาะวิชานี้"
      const tempAssignments = []; // 🔧 FIX

      // ❗ ของเดิม
      if (totalPeriods > slots) {
        const msg =
          `❌ ${subj.name}: ใช้ ${totalPeriods} คาบ > คาบต่อวัน (${slots})`;
        console.warn(msg);
        setLog(prev => prev + "\n" + msg);
        continue;
      }

      // 🔁 แตก session จนคาบครบ
      while (remainingPeriods > 0) {
        let placed = false;

        for (const duration of durationCandidates) {
          if (placed) break;
          if (duration > remainingPeriods) continue;

          const isSplit = duration < totalPeriods;

          if (isSplit) {
            setLog(prev =>
              prev +
              `\n↪ ทดลองแบ่งคาบ ${subj.name} เหลือ ${duration} คาบ/ครั้ง | จากเดิม ${totalPeriods} คาบ`
            );
          }

          for (let pass = 0; pass < 2 && !placed; pass++) {
            const allowLunch = pass === 1 || !avoidLunch;

            for (let attempt = 0; attempt < 500 && !placed; attempt++) {

              const day = pickDayForGroup(
                ctx.groupName,
                assignments,
                globalAssignments
              );

              // 🔧 FIX: รวม assignment ที่ commit แล้ว + ของวิชานี้
              const localAssignments = [...assignments, ...tempAssignments];

              const usedSlots = getUsedSlotsForDay(
                ctx.groupName,
                day,
                localAssignments,
                globalAssignments
              );

              if (usedSlots + duration > slots) continue;

              const startSlot = Math.floor(
                Math.random() * (slots - duration + 1)
              );

              const hitsLunch =
                startSlot <= lunchSlot &&
                startSlot + duration > lunchSlot;

              if (strictAvoidLunch && hitsLunch) continue;
              if (!allowLunch && avoidLunch && hitsLunch) continue;

              const selectedTeachers = subj.teachers?.length
                ? teachers.filter(t => subj.teachers.includes(t.id))
                : teachers;

              const teacher = chooseTeacher(
                selectedTeachers,
                localAssignments,
                globalAssignments
              );
              if (!teacher) continue;

              if (isTeacherUnavailable(teacher, day, startSlot, duration)) continue;

              const room = rooms[Math.floor(Math.random() * rooms.length)];

              // 🔧 FIX: ตรวจชนกับ localAssignments แทน assignments
              if (
                isTeacherBusy(
                  teacher.id,
                  day,
                  startSlot,
                  duration,
                  localAssignments,
                  globalAssignments
                ) ||
                isRoomBusy(
                  room.id,
                  day,
                  startSlot,
                  duration,
                  localAssignments,
                  globalAssignments
                ) ||
                isClassBusy(
                  ctx.groupName,
                  day,
                  startSlot,
                  duration,
                  localAssignments
                )
              ) {
                continue;
              }

              const newAssignment = {
                course_id: subj.id,
                course_name: subj.name,
                teacher_id: teacher.id,
                teacher_name: teacher.name,
                room_id: room.id,
                room_name: room.name,
                class_group: ctx.groupName,
                day,
                slot: startSlot,
                duration,
                originalDuration: originalPeriods,
                color: subj.color
              };

              // ❗ ยังไม่ commit
              tempAssignments.push(newAssignment);

              placed = true;
              placedAnything = true;
              remainingPeriods -= duration;
            }

          }
        }

        if (!placed) break;
      }

      // 🔴 All-or-Nothing decision
      if (remainingPeriods > 0) {
        // ❌ rollback ทั้งวิชา
        setLog(prev =>
          prev +
          `\n⛔ ยกเลิกวิชา ${subj.name} ทั้งหมด ` +
          `(ลงได้ ${originalPeriods - remainingPeriods}/${originalPeriods} คาบ → rollback)`
        );
        // ไม่ push tempAssignments ใด ๆ
      } else {
        // ✅ commit ทั้งวิชา
        tempAssignments.forEach(a => {
          assignments.push(a);
          globalAssignments.push(a);
        });

        setLog(prev =>
          prev +
          `\n✔ วิชา ${subj.name} ลงครบ ${originalPeriods} คาบ ✅`
        );
      }
    }

    console.log("========== END generateScheduleForOneGroup ==========");
    return assignments;
  }





  /* ======================================================
   *  CLEAR / GENERATE
   * ====================================================== */

  function clearAllTables() {
    if (!window.confirm("ต้องการลบตารางเรียนทั้งหมดหรือไม่?")) return;

    const d = loadData();
    d.allTimetables = {};
    d.lastResult = null;
    saveData(d);

    setResult(null);
    setLog("✔ เคลียร์ตารางทั้งหมดเรียบร้อย");
  }

  async function generateOneClassGroup() {
    if (!group) return alert("กรุณาเลือกกลุ่มเรียน");

    setRunning(true);
    setLog(`▶ เริ่มสร้างตารางให้ ${group}`);

    const d = loadData();
    const globalAssignments = [];

    Object.entries(d.allTimetables || {}).forEach(([g, arr]) => {
      if (g !== group) globalAssignments.push(...arr);
    });

    const grp = classGroups.find(c => c.name === group);
    const ctx = prepareGroupContext(grp);

    const sessions = buildSubjectSessionsForGroup(ctx.groupName);
    const assignments = generateScheduleForOneGroup(ctx, sessions, globalAssignments);

    d.allTimetables = d.allTimetables || {};
    d.allTimetables[ctx.groupName] = assignments;
    d.lastResult = { group: ctx.groupName, assignments };

    saveData(d);

    setResult(d.lastResult);
    setRunning(false);
  }

  async function generateAllClassGroup() {
    if (!window.confirm("ต้องการสร้างตารางทุกกลุ่มหรือไม่?")) return;

    setRunning(true);
    setLog("▶ เริ่มสร้างตารางทุกกลุ่ม\n");

    const d = loadData();
    d.allTimetables = {};
    const globalAssignments = [];

    for (const grp of classGroups) {
      const ctx = prepareGroupContext(grp);
      const sessions = buildSubjectSessionsForGroup(ctx.groupName);
      const assignments = generateScheduleForOneGroup(ctx, sessions, globalAssignments);
      d.allTimetables[ctx.groupName] = assignments;
    }

    saveData(d);
    setRunning(false);
    setLog(p => p + `\n✔ สร้างตารางครบทุกกลุ่มแล้ว`);
  }

  /* ======================================================
   *  UI
   * ====================================================== */

  return (
    <div>
      <h2 className="text-2xl font-bold text-blue-700 mb-4">
        สร้างตารางเรียน
      </h2>

      <div className="card p-4 space-y-4">
        <select
          className="border p-3 rounded-lg"
          value={group}
          onChange={e => setGroup(e.target.value)}
        >
          <option value="">-- เลือกกลุ่มเรียน --</option>
          {filteredGroups.map(g => (
            <option key={g.id || g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>

        <button
          className="btn bg-blue-600 w-full"
          disabled={running}
          onClick={generateOneClassGroup}
        >
          สร้างตาราง (เฉพาะกลุ่ม)
        </button>

        <button
          className="btn bg-emerald-600 w-full"
          disabled={running}
          onClick={generateAllClassGroup}
        >
          สร้างตารางทั้งหมด
        </button>

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
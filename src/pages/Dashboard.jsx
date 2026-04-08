import React, { useMemo } from "react";
import { loadData } from "../utils";

export default function Dashboard() {
  const data = loadData() || {};

  const departments = data.departments || [];
  const teachers = data.teachers || [];
  const rooms = data.rooms || [];
  const subjects = data.subjects || [];
  const classGroups = data.classGroups || [];
  const allTimetables = data.allTimetables || {};
  const settings = data.settings || {};

  const days = settings.days || 5;
  const slots = settings.timeslots_per_day || 8;
  const dayNames = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

  // --------------------------------
  // รวมตารางทั้งหมดเป็น array ใหญ่
  const allAssignments = useMemo(() => {
    const arr = [];
    for (const groupName in allTimetables) {
      const items = allTimetables[groupName] || [];
      items.forEach(a => arr.push(a));
    }
    return arr;
  }, [allTimetables]);

  // นับคาบทั้งหมด (คิดตาม duration)
  const totalPeriodsUsed = useMemo(
    () => allAssignments.reduce((sum, a) => sum + (a.duration || 1), 0),
    [allAssignments]
  );

  // ศักยภาพคาบทั้งหมด = กลุ่มเรียน × วัน × คาบ
  const totalPossiblePeriods = useMemo(
    () => classGroups.length * days * slots,
    [classGroups.length, days, slots]
  );

  const fillRate = totalPossiblePeriods
    ? Math.round((totalPeriodsUsed / totalPossiblePeriods) * 100)
    : 0;

  // --------------------------------
  // ใช้งานรายวัน (ดูวันไหนแน่นสุด)
  const dailyUsage = useMemo(() => {
    const arr = new Array(days).fill(0);
    allAssignments.forEach(a => {
      if (typeof a.day === "number" && a.day >= 0 && a.day < days) {
        arr[a.day] += a.duration || 1;
      }
    });
    return arr;
  }, [allAssignments, days]);

  const busiestDayIndex = dailyUsage.reduce(
    (best, val, idx, arr) => (val > arr[best] ? idx : best),
    0
  );
  const busiestDayName =
    days > 0 ? dayNames[busiestDayIndex] || `วัน ${busiestDayIndex + 1}` : "-";

  // --------------------------------
  // กลุ่มเรียน / ครู / ห้องที่ยังไม่ถูกใช้
  const usedGroupsSet = new Set(allAssignments.map(a => a.class_group));
  const usedTeacherSet = new Set(allAssignments.map(a => a.teacher_id));
  const usedRoomSet = new Set(allAssignments.map(a => a.room_id));

  const unusedGroups = classGroups.filter(g => !usedGroupsSet.has(g.name));
  const unusedTeachers = teachers.filter(t => !usedTeacherSet.has(t.id));
  const unusedRooms = rooms.filter(r => !usedRoomSet.has(r.id));

  // --------------------------------
  // นับ conflict แบบเร็ว ๆ (สำหรับสรุป)
  function isOverlap(a, b) {
    if (a.day !== b.day) return false;
    const s1 = a.slot;
    const e1 = a.slot + (a.duration || 1) - 1;
    const s2 = b.slot;
    const e2 = b.slot + (b.duration || 1) - 1;
    return !(e1 < s2 || e2 < s1);
  }

  const conflictSummary = useMemo(() => {
    let room = 0;
    let teacher = 0;
    let group = 0;

    const N = allAssignments.length;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = allAssignments[i];
        const b = allAssignments[j];
        if (!isOverlap(a, b)) continue;

        if (a.room_id && b.room_id && a.room_id === b.room_id) room++;
        if (a.teacher_id && b.teacher_id && a.teacher_id === b.teacher_id) teacher++;
        if (a.class_group === b.class_group) group++;
      }
    }
    return { room, teacher, group };
  }, [allAssignments]);

  const totalConflicts =
    conflictSummary.room + conflictSummary.teacher + conflictSummary.group;

  // --------------------------------
  // ข้อเสนอแนะสั้น ๆ
  const suggestions = [];
  if (!classGroups.length) {
    suggestions.push("ยังไม่มีการเพิ่มกลุ่มเรียนในระบบ");
  }
  if (!teachers.length) {
    suggestions.push("ยังไม่มีการเพิ่มข้อมูลครูผู้สอน");
  }
  if (!rooms.length) {
    suggestions.push("ยังไม่มีการเพิ่มข้อมูลห้องเรียน");
  }
  if (!subjects.length) {
    suggestions.push("ยังไม่มีการเพิ่มรายวิชา");
  }
  if (classGroups.length && !allAssignments.length) {
    suggestions.push("ยังไม่มีการสร้างตารางเรียน (ลองไปที่เมนู “สร้างตาราง”)");
  }
  if (fillRate < 20 && allAssignments.length > 0) {
    suggestions.push("ปริมาณคาบที่ใช้ยังน้อยมาก — ตรวจสอบจำนวนคาบต่อวิชาหรือโครงเวลา");
  }
  if (totalConflicts > 0) {
    suggestions.push("พบตารางชนกัน — แนะนำให้ตรวจที่เมนู “ตรวจสอบตาราง (Validation)”");
  }
  if (unusedGroups.length > 0) {
    suggestions.push(`มีกลุ่มเรียน ${unusedGroups.length} กลุ่มที่ยังไม่มีคาบเรียน`);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-blue-700 mb-1">
        แดชบอร์ดภาพรวมระบบ NexaTime
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        สรุปสถานะข้อมูลและตารางเรียนของวิทยาลัยในมุมมองเดียว —
        ใช้ตรวจความพร้อมของข้อมูลก่อนสั่งให้ AI สร้างตารางเรียน
      </p>

      {/* แถวบน: ตัวเลขภาพรวมระบบ */}
      <div className="grid md:grid-cols-5 gap-3 mb-4 text-sm">
        <div className="card p-3">
          <div className="text-xs text-gray-500">แผนก</div>
          <div className="text-2xl font-bold text-blue-700">{departments.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500">กลุ่มเรียน</div>
          <div className="text-2xl font-bold text-blue-700">{classGroups.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500">ครูผู้สอน</div>
          <div className="text-2xl font-bold text-blue-700">{teachers.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500">รายวิชา</div>
          <div className="text-2xl font-bold text-blue-700">{subjects.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500">ห้องเรียน</div>
          <div className="text-2xl font-bold text-blue-700">{rooms.length}</div>
        </div>
      </div>

      {/* แถวกลาง: สถานะตาราง & การกระจายคาบ */}
      <div className="grid md:grid-cols-3 gap-4 mb-4 text-sm">
        {/* การใช้คาบภาพรวม */}
        <div className="card p-4">
          <div className="font-semibold mb-2">ภาพรวมการใช้คาบเรียน</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-blue-700">
              {fillRate}%
            </div>
            <div className="text-xs text-gray-500">
              ของคาบทั้งหมดที่เป็นไปได้
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            ใช้ไปแล้ว{" "}
            <span className="font-semibold">
              {totalPeriodsUsed.toLocaleString()}
            </span>{" "}
            คาบ จากศักยภาพ{" "}
            <span className="font-semibold">
              {totalPossiblePeriods.toLocaleString()}
            </span>{" "}
            คาบ (กลุ่มเรียน × วัน × คาบ)
          </div>
          <div className="mt-3 text-xs text-gray-500">
            * ตัวเลขนี้ช่วยให้เห็นระดับการใช้งานตาราง เช่น ถ้า % ต่ำมาก
            อาจยังไม่ได้กำหนดจำนวนคาบรายวิชาครบ หรือยังสร้างตารางไม่ครบทุกกลุ่ม
          </div>
        </div>

        {/* ความแน่นรายวัน */}
        <div className="card p-4">
          <div className="font-semibold mb-2">วันเรียนที่แน่นที่สุด</div>
          {days > 0 ? (
            <>
              <div className="text-lg font-bold text-blue-700 mb-1">
                {busiestDayName}
              </div>
              <div className="text-xs text-gray-600 mb-2">
                ใช้ไปทั้งหมด{" "}
                <span className="font-semibold">
                  {dailyUsage[busiestDayIndex] || 0}
                </span>{" "}
                คาบ (รวมทุกกลุ่ม)
              </div>
              <div className="mt-2 text-xs text-gray-500">
                การกระจายคาบเรียน:
              </div>
              <div className="mt-1 space-y-1 text-xs">
                {dailyUsage.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-16">
                      {dayNames[idx] || `วัน ${idx + 1}`}
                    </div>
                    <div className="flex-1 bg-slate-100 h-2 rounded overflow-hidden">
                      <div
                        className="h-2 bg-blue-500"
                        style={{
                          width:
                            totalPeriodsUsed > 0
                              ? `${(val / totalPeriodsUsed) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <div className="w-10 text-right">{val}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500">
              ยังไม่ได้กำหนดจำนวนวันเรียนใน “ตั้งค่า AI”
            </div>
          )}
        </div>

        {/* ปัญหา / conflict สรุป */}
        <div className="card p-4">
          <div className="font-semibold mb-2">ปัญหาตารางที่ตรวจพบบางส่วน</div>
          <div className="text-3xl font-bold text-red-600">
            {totalConflicts}
          </div>
          <div className="text-xs text-gray-500 mb-2">
            เคส (นับรวม ทุกประเภทการชน)
          </div>
          <ul className="text-xs text-gray-700 space-y-1">
            <li>• ห้องเรียนชนกัน: {conflictSummary.room} เคส</li>
            <li>• ครูชนคาบ: {conflictSummary.teacher} เคส</li>
            <li>• กลุ่มเรียนชนคาบ: {conflictSummary.group} เคส</li>
          </ul>
          <div className="mt-3 text-xs text-blue-700">
            👉 ดูรายละเอียดแต่ละเคสได้ที่เมนู{" "}
            <span className="font-semibold">
              “ตรวจสอบตาราง (Validation)”
            </span>
          </div>
        </div>
      </div>

      {/* แถวล่าง: สิ่งที่ควรตรวจ + รายการที่ยังไม่ถูกใช้ */}
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        {/* ข้อเสนอแนะ */}
        <div className="card p-4">
          <div className="font-semibold mb-2">สิ่งที่ควรตรวจสอบ / ปรับปรุง</div>
          {suggestions.length === 0 ? (
            <div className="text-emerald-700 text-sm">
              ✅ ข้อมูลพื้นฐานค่อนข้างพร้อม และมีการสร้างตารางแล้ว
            </div>
          ) : (
            <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
              {suggestions.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        {/* กลุ่ม / ครู / ห้องที่ยังไม่ได้ใช้ */}
        <div className="card p-4">
          <div className="font-semibold mb-2">
            รายการที่ยังไม่ถูกผูกกับตารางเรียน
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="font-semibold mb-1">กลุ่มเรียน</div>
              {unusedGroups.length === 0 ? (
                <div className="text-gray-500">– ทุกกลุ่มมีตารางแล้ว</div>
              ) : (
                <ul className="space-y-0.5">
                  {unusedGroups.slice(0, 6).map(g => (
                    <li key={g.id}>{g.name}</li>
                  ))}
                  {unusedGroups.length > 6 && (
                    <li className="text-gray-400">
                      + อีก {unusedGroups.length - 6} กลุ่ม
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <div className="font-semibold mb-1">ครูผู้สอน</div>
              {unusedTeachers.length === 0 ? (
                <div className="text-gray-500">– ครูทุกคนมีคาบสอนแล้ว</div>
              ) : (
                <ul className="space-y-0.5">
                  {unusedTeachers.slice(0, 6).map(t => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                  {unusedTeachers.length > 6 && (
                    <li className="text-gray-400">
                      + อีก {unusedTeachers.length - 6} คน
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <div className="font-semibold mb-1">ห้องเรียน</div>
              {unusedRooms.length === 0 ? (
                <div className="text-gray-500">– ทุกห้องมีการใช้งานแล้ว</div>
              ) : (
                <ul className="space-y-0.5">
                  {unusedRooms.slice(0, 6).map(r => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                  {unusedRooms.length > 6 && (
                    <li className="text-gray-400">
                      + อีก {unusedRooms.length - 6} ห้อง
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            * ถ้ามีรายการยังไม่ได้ใช้ อาจต้องตรวจว่าได้สร้างตารางให้ทุกแผนก /
            ทุกกลุ่มครบหรือยัง
          </div>
        </div>
      </div>
      {/* Footer: Creator Credit (no border, no bg, always bottom) */}
      <div style={{width:'100%',textAlign:'center',fontSize:'12px',color:'#aaa',position:'fixed',left:0,bottom:0,zIndex:50,background:'none',padding:'8px 0',pointerEvents:'none'}}>
        สร้างและพัฒนาโดย NexaTime Team © 2025
      </div>
    </div>
  );
}

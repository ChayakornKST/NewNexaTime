// src/pages/Settings.jsx
import React, { useEffect, useState } from "react";
import { loadData, saveData } from "../utils";

export default function Settings() {
  const [settings, setSettings] = useState({
    days: 5,
    timeslots_per_day: 8,
    maxPeriodsPerDay: 10,   // ✅ ห้ามลงเกินคาบที่ 10 ต่อวัน

    // ✅ ตัวเลือกพฤติกรรม AI
    strictAvoidLunch : false, // บังคับเลี่ยงคาบพักกลางวัน ห้ามโดยเด็ดขาด 
    avoidLunch: true,       // พยายามเลี่ยงคาบพักกลางวัน
    lunchSlot: 4,           // index (0-based) → 4 = คาบที่ 5
    spreadDays: true,       // กระจายวิชาข้ามวัน
    strictRoomTag: true,    // เข้มงวด room_tag
    balanceTeachers: true,  // กระจายภาระครู
    isMatchRoomType: false,  // บังคับให้จัดตารางแยกห้องเรียน
    checkMaxPeriodsPerDay: false // ✅ เช็คห้ามลงเกินคาบที่ 10 ต่อวัน
  });

  useEffect(() => {
    const d = loadData();
    if (d.settings) {
      setSettings(prev => ({ ...prev, ...d.settings }));
    }
  }, []);

  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const d = loadData();
    d.settings = settings;
    saveData(d);
    alert("บันทึกการตั้งค่า AI เรียบร้อยแล้ว");
    console.log("Saved settings: ", settings);
  }

  const lunchSlotDisplay = (settings.lunchSlot ?? 4) + 1;

  return (
    <div>
      {/* 🧠 หัวข้อใหญ่ */}
      <h2 className="text-2xl font-bold text-blue-700 mb-1">
        ศูนย์ควบคุมสมองกลจัดตาราง (AI Control Center)
      </h2>
      <div className="text-sm text-gray-600 mb-4">
        กำหนด “กติกา” และ “สไตล์การคิด” ของ AI ก่อนสั่งสร้างตารางเรียนทั้งระบบ
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ✅ ฝั่งซ้าย: กรอบเวลา + สวิตช์ AI ที่มีผลจริง */}
        <div className="card p-4 space-y-4">
          <h3 className="font-semibold mb-2">
            🔧 ตั้งค่ากรอบเวลา & พฤติกรรมหลักของ AI
          </h3>

          {/* จำนวนวันเรียน */}
          <div>
            <label className="block mb-1 font-medium">
              1) จำนวนวันเรียนต่อสัปดาห์
            </label>
            <input
              type="number"
              min={1}
              max={7}
              className="w-full p-2 border rounded"
              value={settings.days}
              onChange={e =>
                handleChange("days", Number(e.target.value) || 1)
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              กำหนดโครงตาราง เช่น 5 = จันทร์–ศุกร์, 6 = จันทร์–เสาร์
            </div>
          </div>

          {/* จำนวนคาบต่อวัน */}
          <div>
            <label className="block mb-1 font-medium">
              2) จำนวนคาบเรียนต่อวัน
            </label>
            <input
              type="number"
              min={1}
              className="w-full p-2 border rounded"
              value={settings.timeslots_per_day}
              onChange={e =>
                handleChange("timeslots_per_day", Number(e.target.value) || 1)
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              เช่น 8 / 10 / 12 คาบ ตามโครงตารางจริงของวิทยาลัย
            </div>
          </div>

          {/* คาบพักกลางวัน */}
          <div>
            <label className="block mb-1 font-medium">
              3) กำหนดคาบพักกลางวัน (เลขคาบ)
            </label>
            <input
              type="number"
              min={1}
              max={settings.timeslots_per_day || 8}
              className="w-full p-2 border rounded"
              value={lunchSlotDisplay}
              onChange={e => {
                const val = Number(e.target.value) || 1;
                handleChange("lunchSlot", Math.max(0, val - 1));
              }}
            />
            <div className="text-xs text-gray-500 mt-1">
              ใส่เลขคาบที่ใช้เป็นพักกลางวัน เช่น 5 = พักคาบที่ 5
            </div>
          </div>

          {/* จำนวนคาบสูงสุดต่อวัน */}
          <div>
            <label className="block mb-1 font-medium">
              4) จำนวนคาบสูงสุดต่อวัน (สำหรับเช็คการจัดตาราง)
            </label>
            <input
              type="number"
              min={1}
              className="w-full p-2 border rounded"
              value={settings.maxPeriodsPerDay}
              onChange={e =>
                handleChange("maxPeriodsPerDay", Number(e.target.value) || 10)
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              ระบุจำนวนคาบสูงสุดที่อนุญาตให้วางในแต่ละวัน (ค่าเริ่มต้น: 10)
            </div>
          </div>

          <hr className="my-2" />

          {/* ✅ Checkbox พฤติกรรม AI */}
          <div className="space-y-2 text-sm">
            <h4 className="font-semibold mb-1">
              🎛 สวิตช์การตัดสินใจของ AI ขณะจัดตาราง
            </h4>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.strictAvoidLunch}
                onChange={e => handleChange("strictAvoidLunch", e.target.checked)}
              />
              <div>
                <div className="font-medium">บังคับเลี่ยงคาบพักกลางวันโดยเด็ดขาด</div>
                <div className="text-xs text-gray-500">
                  AI จะไม่เลือกคาบที่ {lunchSlotDisplay} เป็นคาบเรียนโดยเด็ดขาด เช่น โรงเรียนมีนโยบายห้ามสอนในคาบพักกลางวัน
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.avoidLunch}
                onChange={e => handleChange("avoidLunch", e.target.checked)}
              />
              <div>
                <div className="font-medium">เลี่ยงคาบพักกลางวัน</div>
                <div className="text-xs text-gray-500">
                  AI จะพยายามไม่เลือกคาบที่ {lunchSlotDisplay} เป็นตัวเลือกแรก ๆ
                  เว้นแต่หาคาบอื่นไม่ได้จริง ๆ
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.isMatchRoomType}
                onChange={e => handleChange("isMatchRoomType", e.target.checked)}
              />
              <div>
                <div className="font-medium">บังคับให้จัดตารางแยกห้องเรียน</div>
                <div className="text-xs text-gray-500">
                  AI จะตรวจสอบและแยกประเภทห้องเรียนตามที่ระบุในข้อมูลห้องเรียน ปฏิบัติกับทฤษฎี
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.spreadDays}
                onChange={e => handleChange("spreadDays", e.target.checked)}
              />
              <div>
                <div className="font-medium">กระจายวิชาข้ามวัน (ไม่กองวันเดียว)</div>
                <div className="text-xs text-gray-500">
                  AI จะดูจำนวนคาบที่ถูกวางในแต่ละวัน แล้วเลือกวันคาบน้อยกว่า
                  เพื่อไม่ให้วิชาหนัก ๆ กองอยู่แค่วันจันทร์–อังคาร
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.strictRoomTag}
                onChange={e => handleChange("strictRoomTag", e.target.checked)}
              />
              <div>
                <div className="font-medium">
                  บังคับใช้ Tag ห้องเรียนอย่างเคร่งครัด
                </div>
                <div className="text-xs text-gray-500">
                  ถ้าวิชาระบุ <code>room_tag</code> ไว้
                  แต่ไม่มีห้องที่ tag ตรงกันเลย ระบบจะ{" "}
                  <span className="font-semibold">ไม่วางวิชานั้น</span>{" "}
                  และแจ้งใน Log ให้ตรวจสอบข้อมูล
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.balanceTeachers}
                onChange={e => handleChange("balanceTeachers", e.target.checked)}
              />
              <div>
                <div className="font-medium">กระจายภาระครูให้สมดุล</div>
                <div className="text-xs text-gray-500">
                  เมื่อมีครูหลายคนสอนได้วิชาเดียวกัน AI จะเลือกครูที่มีจำนวนคาบสอนน้อยกว่า
                  ก่อน เพื่อลดภาระบางคนที่แน่นเกินไป
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.checkMaxPeriodsPerDay}
                onChange={e => handleChange("checkMaxPeriodsPerDay", e.target.checked)}
              />
              <div>
                <div className="font-medium">ห้ามลงเกินคาบที่ {settings.maxPeriodsPerDay} ต่อวัน</div>
                <div className="text-xs text-gray-500">
                  AI จะตรวจสอบและไม่อนุญาตให้วางคาบเรียนในแต่ละวันเกินจำนวนที่กำหนด
                  ป้องกันตารางที่แน่นเกินไป
                </div>
              </div>
            </label>
          </div>

          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 w-full mt-3"
          >
            💾 บันทึกการตั้งค่า AI
          </button>
        </div>

        {/* ℹ️ ฝั่งขวา: อธิบายการทำงานของ “สมองกล” */}
        <div className="card p-4 space-y-3 text-sm leading-relaxed">
          <h3 className="font-semibold mb-1">
            🧠 AI ของ NexaTime คิดอย่างไรเวลาจัดตาราง?
          </h3>

          <p className="text-gray-700">
            เมื่อกดปุ่ม{" "}
            <span className="font-semibold">“สร้างตาราง”</span>{" "}
            ในหน้าเมนูสร้างตาราง ระบบจะอ่านค่าจากหน้านี้ แล้วใช้เป็น
            <span className="font-semibold"> “กติกา + สไตล์การจัดตาราง”</span>{" "}
            ร่วมกับข้อมูลจริงจาก{" "}
            <span className="font-semibold">
              จัดการครู, จัดการวิชา, จัดการห้องเรียน, แผนก, กลุ่มเรียน
            </span>
          </p>

          <ul className="list-disc list-inside space-y-1 text-gray-700">
            <li>
              <span className="font-semibold">โครงเวลา (วัน × คาบ)</span>{" "}
              คือพื้นที่ที่ AI สามารถวางคาบเรียนได้
            </li>
            <li>
              AI จะพยายาม:
              <ul className="list-disc list-inside ml-5">
                <li>ไม่ให้ครูคนเดียวกันสอนซ้อนคาบเดียวกัน</li>
                <li>ไม่ให้กลุ่มเรียนเดียวกันมีมากกว่า 1 วิชาในคาบเดียว</li>
                <li>ไม่ให้ห้องเดียวกันถูกใช้ซ้ำในคาบเดียวกัน</li>
                <li>
                  ตรวจว่า <code>จำนวนนักเรียน</code> ไม่เกิน{" "}
                  <code>capacity</code> ของห้อง (ถ้ามีกรอกข้อมูล)
                </li>
              </ul>
            </li>
            <li>
              ตัวเลือกด้านซ้าย (ติ๊ก) จะมีผลต่อ “ลำดับความคิด” เช่น
              <ul className="list-disc list-inside ml-5">
                <li>
                  เลี่ยงคาบพักกลางวัน → ไม่วางวิชาทับคาบพักถ้าไม่จำเป็น
                </li>
                <li>
                  กระจายวิชาข้ามวัน → ดูโหลดของแต่ละวัน แล้วเลือกวันคาบน้อย
                </li>
                <li>
                  ใช้ Tag ห้องเข้มงวด → วิชาเฉพาะทางต้องได้ห้องตรง tag เท่านั้น
                </li>
                <li>
                  กระจายภาระครู → เลือกครูที่มีคาบน้อยกว่าเมื่อมีหลายคนสอนได้
                </li>
              </ul>
            </li>
          </ul>

          <h4 className="font-semibold mt-3">
            🚀 โหมดการสร้างตารางในหน้า “สร้างตาราง”
          </h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            <li>
              <span className="font-semibold">
                สร้างตาราง (เฉพาะกลุ่ม)
              </span>{" "}
              – เลือกแผนก + กลุ่มเรียน แล้ว AI จะลองจัดเฉพาะกลุ่มนั้น
              โดยเคารพตารางเดิมของกลุ่มอื่น (กันครู/ห้องชน)
            </li>
            <li>
              <span className="font-semibold">
                สร้างตารางทั้งหมดในแผนกนี้
              </span>{" "}
              – จัดทุกกลุ่มในแผนกเดียวกันให้ไม่ชนกันทั้งครูและห้อง
              และไม่ไปชนกับแผนกที่ล็อกตารางไว้ก่อนแล้ว
            </li>
            <li>
              <span className="font-semibold">
                สร้างตารางทั้งหมด (ทุกแผนก)
              </span>{" "}
              – เคลียร์ตารางเดิมทั้งหมด แล้วให้ AI สร้างตารางใหม่ทั้งวิทยาลัย
              ตามกติกาที่ตั้งในหน้านี้
            </li>
          </ul>

          <div className="mt-2 text-xs text-gray-500 border-t pt-2">
            เคล็ดลับ: ก่อนสั่ง AI ทำงาน แนะนำให้ตรวจความครบถ้วนของ{" "}
            <span className="font-semibold">
              ครู, วิชา, ห้อง, กลุ่มเรียน, จำนวนนักเรียน, room_tag, capacity
            </span>{" "}
            ให้เรียบร้อย จะช่วยลดเคส “วางวิชาไม่สำเร็จ” ได้มาก
          </div>
        </div>
      </div>
    </div>
  );
}

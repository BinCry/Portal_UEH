import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

type SectionRecord = {
  sectionCode: string;
  credits: number;
  registeredCount: number;
  remainingSeats: number;
  capacity: number;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  timeSlotLabel: string;
  startDate: string | null;
  endDate: string | null;
  roomCode: string;
  campus: string;
  address: string;
  building: string;
};

type CourseRecord = {
  classification: string;
  courseCode: string;
  courseName: string;
  credits: number;
  sections: SectionRecord[];
};

type Output = {
  generatedAt: string;
  sourcePath: string;
  courses: CourseRecord[];
};

const VI_DAY_TO_ENUM: Record<string, DayOfWeek> = {
  "THU HAI": "MONDAY",
  "THU BA": "TUESDAY",
  "THU TU": "WEDNESDAY",
  "THU NAM": "THURSDAY",
  "THU SAU": "FRIDAY",
  "THU BAY": "SATURDAY",
  "CHU NHAT": "SUNDAY",
};

const normalizeSearchText = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const normalizeDayName = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();

const normalizeTime = (raw: string) => {
  const match = raw.trim().match(/^(\d{1,2})g(\d{2})$/i);
  if (!match) return "00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const parseDateVN = (raw: string) => {
  const [dd, mm, yyyy] = raw.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const deriveCourseCode = (sectionCode: string, fallbackName: string) => {
  const match = sectionCode.match(/[A-Z]{2,}[0-9]{2,}/i);
  if (match) return match[0].toUpperCase();
  return fallbackName
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 8);
};

const parseClassInfo = (raw: string) => {
  const parts = raw.split(",").map((item) => item.trim());
  const dayPart = parts[0] ?? "";
  const timePart = parts[1] ?? "";
  const datePart = parts[2] ?? "";
  const locationPart = parts.slice(3).join(", ").trim();

  const normalizedDay = normalizeDayName(dayPart);
  const dayOfWeek = VI_DAY_TO_ENUM[normalizedDay] ?? "MONDAY";

  const timeMatch = timePart.match(/(\d{1,2}g\d{2})\s*-\s*(\d{1,2}g\d{2})/i);
  const startTime = normalizeTime(timeMatch?.[1] ?? "00g00");
  const endTime = normalizeTime(timeMatch?.[2] ?? "00g00");
  const timeSlotLabel = `${startTime}-${endTime}`;

  const dateMatch = datePart.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  const startDate = dateMatch ? parseDateVN(dateMatch[1]) : null;
  const endDate = dateMatch ? parseDateVN(dateMatch[2]) : null;

  return {
    dayOfWeek,
    startTime,
    endTime,
    timeSlotLabel,
    startDate,
    endDate,
    location: locationPart || "Đang cập nhật địa điểm học",
  };
};

const resolveCampus = (address: string) => {
  const text = normalizeSearchText(address);

  if (text.includes("nguyen van linh")) return "Cơ sở Nam Sài Gòn";
  if (text.includes("nguyen trai")) return "Cơ sở Nguyễn Trãi";
  if (text.includes("tran quang khai")) return "Cơ sở Trần Quang Khải";
  if (text.includes("nguyen dinh chieu")) return "Cơ sở Nguyễn Đình Chiểu";
  if (text.includes("vo van tan")) return "Cơ sở Võ Văn Tần";

  return "Cơ sở đang cập nhật";
};

const derivePlanTypeText = (classification: string) => {
  const text = normalizeSearchText(classification);
  if (text.includes("ngoai ke hoach")) return "Ngoài kế hoạch";
  return "Trong kế hoạch";
};

const sourcePath = process.env.SEED_XLSX_PATH ?? "C:\\Users\\HP\\Downloads\\DATA WEB.xlsx";
const outputPath = path.join(process.cwd(), "prisma", "seed-data", "data-web.normalized.json");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Không tìm thấy file Excel: ${sourcePath}`);
}

const workbook = XLSX.readFile(sourcePath);
const firstSheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[firstSheetName];
const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
  header: 1,
});

const coursesMap = new Map<string, CourseRecord>();

let currentClassification = "";
let currentCourseName = "";

for (let index = 2; index < rows.length; index += 1) {
  const row = rows[index];
  if (!row) continue;

  const classification = String(row[0] ?? "").trim();
  const courseName = String(row[1] ?? "").trim();
  const sectionCode = String(row[2] ?? "").trim();
  const credits = Number(row[3] ?? 0);
  const registeredCount = Number(row[4] ?? 0);
  const remainingSeats = Number(row[5] ?? 0);
  const classInfo = String(row[6] ?? "").trim();

  if (!sectionCode) continue;
  if (classification) currentClassification = classification;
  if (courseName) currentCourseName = courseName;
  if (!currentCourseName) continue;

  const parsed = parseClassInfo(classInfo);
  const courseCode = deriveCourseCode(sectionCode, currentCourseName);
  const key = `${courseCode}-${currentCourseName}`;
  const capacity = Math.max(registeredCount + remainingSeats, registeredCount);

  if (!coursesMap.has(key)) {
    coursesMap.set(key, {
      classification: derivePlanTypeText(currentClassification || "Trong kế hoạch"),
      courseCode,
      courseName: currentCourseName,
      credits: Number.isFinite(credits) && credits > 0 ? credits : 3,
      sections: [],
    });
  }

  const roomCode = sectionCode.slice(-4).padStart(4, "0");
  const address = parsed.location;
  const campus = resolveCampus(address);

  coursesMap.get(key)!.sections.push({
    sectionCode,
    credits: Number.isFinite(credits) && credits > 0 ? credits : 3,
    registeredCount: Number.isFinite(registeredCount) ? registeredCount : 0,
    remainingSeats: Number.isFinite(remainingSeats) ? remainingSeats : 0,
    capacity,
    dayOfWeek: parsed.dayOfWeek,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    timeSlotLabel: parsed.timeSlotLabel,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    roomCode: `P-${roomCode}`,
    campus,
    address,
    building: campus,
  });
}

const output: Output = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  courses: [...coursesMap.values()],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

console.log(`Đã tạo ${outputPath}`);
console.log(`Tổng học phần: ${output.courses.length}`);

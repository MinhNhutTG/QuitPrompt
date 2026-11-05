// Sóng theo lịch (trang "Đón sóng", tài liệu 14): the shopping days that come back every year in Vietnam, with how long
// before each one the videos should be getting ready. Lunar dates (Tết, Trung thu) are listed per year.
import { addDays, vnDay } from "./util.js";

const LUNAR = {
  tet: { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03" },
  trungthu: { 2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22", 2030: "2030-09-12" },
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// nth weekday (0 = Sunday) of a month; n = -1 for the last one.
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return ymd(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return ymd(y, m, lastDay.getUTCDate() - back);
}

// lead: days before the day to start preparing. big: a major selling season.
function eventsOf(y) {
  const out = [
    { day: ymd(y, 1, 1), name: "Tết Dương lịch", lead: 21 },
    { day: ymd(y, 2, 14), name: "Valentine", lead: 21, hint: "Quà tặng, đồ đôi, mỹ phẩm" },
    { day: ymd(y, 3, 8), name: "Quốc tế Phụ nữ 8/3", lead: 28, big: true, hint: "Quà tặng nữ, thời trang, mỹ phẩm" },
    { day: ymd(y, 4, 30), name: "Lễ 30/4 – 1/5", lead: 21, hint: "Đồ du lịch, đi biển, chống nắng" },
    { day: nthWeekday(y, 5, 0, 2), name: "Ngày của Mẹ", lead: 21, hint: "Quà tặng mẹ" },
    { day: ymd(y, 6, 1), name: "Quốc tế Thiếu nhi", lead: 21, hint: "Đồ chơi, đồ trẻ em" },
    { day: nthWeekday(y, 6, 0, 3), name: "Ngày của Cha", lead: 14, hint: "Quà tặng nam" },
    { day: ymd(y, 9, 5), name: "Khai giảng", lead: 35, big: true, hint: "Đồ đi học, balo, giày, đồng phục" },
    { day: ymd(y, 10, 20), name: "Phụ nữ Việt Nam 20/10", lead: 28, big: true, hint: "Quà tặng nữ, thời trang, mỹ phẩm" },
    { day: ymd(y, 11, 20), name: "Nhà giáo Việt Nam 20/11", lead: 21, hint: "Quà tặng thầy cô" },
    { day: nthWeekday(y, 11, 5, -1), name: "Black Friday", lead: 21, big: true },
    { day: ymd(y, 12, 24), name: "Giáng sinh", lead: 28, big: true, hint: "Đồ trang trí, quà, đồ đi chơi" },
  ];
  // Ngày đôi: the platforms' big sale days.
  for (let m = 1; m <= 12; m++) {
    const big = m >= 9; // 9/9 to 12/12 are the year's largest
    out.push({ day: ymd(y, m, m), name: `Sale ngày đôi ${m}/${m}`, lead: big ? 21 : 10, big: m >= 11 });
  }
  if (LUNAR.tet[y]) out.push({ day: LUNAR.tet[y], name: "Tết Nguyên đán", lead: 42, big: true, hint: "Quần áo Tết, quà biếu, trang trí" });
  if (LUNAR.trungthu[y]) out.push({ day: LUNAR.trungthu[y], name: "Trung thu", lead: 28, hint: "Bánh, lồng đèn, quà biếu" });
  return out;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Coming days within `within` days, soonest first: { day, name, hint, big, prepFrom, daysLeft, preparing }.
export function upcomingSeasons(within = 60, today = vnDay()) {
  const y = Number(today.slice(0, 4));
  return [...eventsOf(y), ...eventsOf(y + 1)]
    .map((e) => ({ ...e, prepFrom: addDays(e.day, -e.lead), daysLeft: daysBetween(today, e.day) }))
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= within)
    .map((e) => ({ ...e, preparing: e.prepFrom <= today }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

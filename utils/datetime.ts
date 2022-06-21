// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { tzOffset } from "https://raw.githubusercontent.com/Tak-Iwamoto/ptera/ec29b7cfa3038b1cea07b9d0d1e69c39ee472d6d/timezone.ts";

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type TimeZone = (typeof timeZones)[number];

export function isValidTimeZone(
  timeZone: string,
): timeZone is TimeZone {
  // deno-lint-ignore no-explicit-any
  return timeZones.includes(timeZone as any);
}

const RE_HOUR_MINUTE = /([01][0-9]|2[0-3]):([0-5][0-9])/;
export function isValidHourMinute(hourMinute: string) {
  return RE_HOUR_MINUTE.test(hourMinute);
}

export function hourMinuteToSec(hourMinute: string): number | undefined {
  const match = hourMinute.match(RE_HOUR_MINUTE);
  if (!match) {
    return;
  }
  const [, h, m] = match;
  return +h * HOUR + +m * MIN;
}

export function secToHourMinute(sec: number): string {
  if (sec >= 24 * HOUR || sec < 0) {
    throw new RangeError(
      `The given sec is out of the range between 0 <= sec < 24`,
    );
  }
  const h = Math.floor(sec / HOUR);
  const m = Math.floor((sec % HOUR) / MIN);
  return h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0");
}

const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type WeekDay = (typeof weekDays)[number];

export function isValidWeekDay(day: unknown): day is WeekDay {
  // deno-lint-ignore no-explicit-any
  return weekDays.includes(day as any);
}

/** Returns a date of the given date string in the given time zone.
 * The given date needs to be in form of "YYYY-MM-DDTHH:mm:ssZ"
 *
 * If you want to get the date of 2022/10/02 1am in Australia/Sydney
 * Then call this like:
 *
 * ```ts
 * const d = zonedDate("2022-10-02T01:00Z", "Australia/Sydney");
 * ```
 */
export function zonedDate(date: string, timeZone: TimeZone): Date {
  const d = new Date(date);
  // First get an offset from the given date and timeZone.
  // This can be wrong 1 hour when d is close to daylight saving time
  // boundary.
  const offset = tzOffset(d, timeZone);
  // We get an offset again with the adjusted date object.
  // This is better approximation than the above.
  const betterOffset = tzOffset(new Date(+d - offset), timeZone);
  return new Date(+d - betterOffset);
}

/** WeekRange represents an available range in a week. */
export type WeekRange = {
  weekDay: WeekDay;
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
};

export type WeekRangeMap = Record<WeekDay, WeekRange[]>;

export type Range = {
  start: Date;
  end: Date;
};

export function weekRangeListToMap(ranges: WeekRange[]): WeekRangeMap {
  return {
    SUN: ranges.filter((r) => r.weekDay === "SUN"),
    MON: ranges.filter((r) => r.weekDay === "MON"),
    TUE: ranges.filter((r) => r.weekDay === "TUE"),
    WED: ranges.filter((r) => r.weekDay === "WED"),
    THU: ranges.filter((r) => r.weekDay === "THU"),
    FRI: ranges.filter((r) => r.weekDay === "FRI"),
    SAT: ranges.filter((r) => r.weekDay === "SAT"),
  };
}

function numberToWeekDay(num: number): WeekDay {
  switch (num) {
    case 0:
      return "SUN";
    case 1:
      return "MON";
    case 2:
      return "TUE";
    case 3:
      return "WED";
    case 4:
      return "THU";
    case 5:
      return "FRI";
    case 6:
      return "SAT";
    default:
      throw new Error(`Invalid number for week day: ${num}`);
  }
}

/** Converts the given WeekRange to a Range with given date and time zone.
 * date needs to be in the form of YYYY-MM-DD. */
function weekRangeToRange(
  date: string,
  weekRange: WeekRange,
  timeZone: TimeZone,
): Range {
  return {
    start: zonedDate(date + "T" + weekRange.startTime + "Z", timeZone),
    end: zonedDate(date + "T" + weekRange.endTime + "Z", timeZone),
  };
}

/** Formats the date in YYYY-MM-DD format in UTC timezone */
export function formatToYearMonthDateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Formats the date in YYYY-MM-DD format in local timezone */
export function formatToYearMonthDateLocal(date: Date) {
  const y = date.getFullYear();
  let m = "" + date.getMonth() + 1;
  if (m.length === 1) {
    m = "0" + m;
  }
  let d = "" + date.getDate();
  if (d.length === 1) {
    d = "0" + d;
  }
  return `${y}-${m}-${d}`;
}

export function startOfMonth(d: Date, n = 0) {
  return new Date(d.getFullYear(), d.getMonth() + n);
}

export function endOfMonth(d: Date, n = 0) {
  return new Date(+new Date(d.getFullYear(), d.getMonth() + 1 + n) - DAY);
}

export function daysOfMonth(d: Date) {
  return (+endOfMonth(d) - +startOfMonth(d)) / DAY + 1;
}

export function getAvailableRangesBetween(
  start: Date,
  end: Date,
  availabilities: WeekRange[],
  timeZone: TimeZone,
): Range[] {
  const map = weekRangeListToMap(availabilities);
  let d = new Date(+start - 2 * DAY);
  const endWithMargin = new Date(+end + 2 * DAY);
  const result = [];
  while (d < endWithMargin) {
    const date = formatToYearMonthDateUTC(d);
    const weekRanges = map[numberToWeekDay(d.getUTCDay())];
    for (const wr of weekRanges) {
      const r = weekRangeToRange(date, wr, timeZone);
      if (r.end > start && r.start < end) {
        result.push(r);
      }
    }
    d = new Date(+d + DAY);
  }

  return result;
}

/**
 * Subtract (take difference) the range list from the other range list.
 * Note: used for calculating diff of user set availability and already
 * occupied slots. The result returns the actual available slots of the user.
 *
 * TODO(kt3k): We can optimize this method if we group the source list and
 * subtract list by, for example, date (YYYY-MM-DD).
 * @param sources
 * @param subtractList
 * @returns
 */
export function subtractRangeListFromRangeList(
  sourceList: Range[],
  subtractList: Range[],
): Range[] {
  const result = [];
  for (const source of sourceList) {
    // We assume sources are disjoint
    result.push(...subtractRangeListFromRange(source, subtractList));
  }
  return result;
}

export function subtractRangeListFromRange(
  source: Range,
  subtractList: Range[],
): Range[] {
  subtractList = [...subtractList];
  while (subtractList.length > 0) {
    const subtract = subtractList.pop();
    const res = subtractRangeFromRange(source, subtract!);
    if (res.length === 0) {
      return [];
    }
    if (res.length === 1) {
      source = res[0];
    }
    if (res.length === 2) {
      const remains = [...subtractList];
      const leftResult = subtractRangeListFromRange(res[0], remains);
      const rightResult = subtractRangeListFromRange(res[1], remains);
      return leftResult.concat(rightResult);
    }
  }
  return [source];
}

/** Returns true if the given range is longer than the given duration.
 * Higher order function, used for filtering the range list. */
export function rangeIsLonger(duration: number) {
  return (range: Range) => +range.end - +range.start >= duration;
}

/** Converts the given data transfer object (parsed json) to Range */
export function rangeFromObj(obj: { start: string; end: string }) {
  return {
    start: new Date(obj.start),
    end: new Date(obj.end),
  };
}

export type DateRangeMap = Record<string, Range[]>;

/** Returns a date-to-ranges map from the given list of ranges. */
export function rangeListToLocalDateRangeMap(ranges: Range[]): DateRangeMap {
  const map: DateRangeMap = {};
  for (const r of ranges) {
    const ymdStart = formatToYearMonthDateLocal(r.start);
    const ranges = map[ymdStart] ??= [];
    ranges.push(r);
    const ymdEnd = formatToYearMonthDateLocal(r.end);
    if (ymdEnd !== ymdEnd) {
      // Here we suppose every range has less than 24 hour duration.
      // So it's enough to check start date and end date.
      const ranges = map[ymdEnd] ??= [];
      ranges.push(r);
    }
  }
  return map;
}

export function subtractRangeFromRange(
  source: Range,
  subtract: Range,
): Range[] {
  if (subtract.end <= source.start) {
    // subtract is too early and no intersection
    return [{ ...source }];
  } else if (source.end <= subtract.start) {
    // subtract is too late and no intersection
    return [{ ...source }];
  } else if (subtract.start <= source.start && source.end <= subtract.end) {
    // subtract covers the entire source
    return [];
  } else if (subtract.start <= source.start && subtract.end < source.end) {
    // subtract covers the first part of source
    return [{ start: subtract.end, end: source.end }];
  } else if (source.start < subtract.start && source.end <= subtract.end) {
    // subtract covers the last part of source
    return [{ start: source.start, end: subtract.start }];
  } else if (source.start < subtract.start && subtract.end < source.end) {
    // subtract is contained in source, so the source is split into two parts
    return [{ start: source.start, end: subtract.start }, {
      start: subtract.end,
      end: source.end,
    }];
  }
  console.log(source, subtract);
  throw new Error("unreachable");
}

export const timeZones = [
  "Africa/Abidjan",
  "Africa/Accra",
  "Africa/Addis_Ababa",
  "Africa/Algiers",
  "Africa/Asmara",
  "Africa/Bamako",
  "Africa/Bangui",
  "Africa/Banjul",
  "Africa/Bissau",
  "Africa/Blantyre",
  "Africa/Brazzaville",
  "Africa/Bujumbura",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Conakry",
  "Africa/Dakar",
  "Africa/Dar_es_Salaam",
  "Africa/Djibouti",
  "Africa/Douala",
  "Africa/El_Aaiun",
  "Africa/Freetown",
  "Africa/Gaborone",
  "Africa/Harare",
  "Africa/Johannesburg",
  "Africa/Juba",
  "Africa/Kampala",
  "Africa/Khartoum",
  "Africa/Kigali",
  "Africa/Kinshasa",
  "Africa/Lagos",
  "Africa/Libreville",
  "Africa/Lome",
  "Africa/Luanda",
  "Africa/Lubumbashi",
  "Africa/Lusaka",
  "Africa/Malabo",
  "Africa/Maputo",
  "Africa/Maseru",
  "Africa/Mbabane",
  "Africa/Mogadishu",
  "Africa/Monrovia",
  "Africa/Nairobi",
  "Africa/Ndjamena",
  "Africa/Niamey",
  "Africa/Nouakchott",
  "Africa/Ouagadougou",
  "Africa/Porto-Novo",
  "Africa/Sao_Tome",
  "Africa/Tripoli",
  "Africa/Tunis",
  "Africa/Windhoek",
  "America/Adak",
  "America/Anchorage",
  "America/Anguilla",
  "America/Antigua",
  "America/Argentina/Buenos_Aires",
  "America/Aruba",
  "America/Asuncion",
  "America/Atikokan",
  "America/Barbados",
  "America/Belize",
  "America/Blanc-Sablon",
  "America/Bogota",
  "America/Cancun",
  "America/Caracas",
  "America/Cayenne",
  "America/Cayman",
  "America/Chicago",
  "America/Costa_Rica",
  "America/Curacao",
  "America/Danmarkshavn",
  "America/Denver",
  "America/Dominica",
  "America/Edmonton",
  "America/El_Salvador",
  "America/Grand_Turk",
  "America/Grenada",
  "America/Guadeloupe",
  "America/Guatemala",
  "America/Guayaquil",
  "America/Guyana",
  "America/Halifax",
  "America/Havana",
  "America/Hermosillo",
  "America/Jamaica",
  "America/Kralendijk",
  "America/La_Paz",
  "America/Lima",
  "America/Los_Angeles",
  "America/Lower_Princes",
  "America/Managua",
  "America/Manaus",
  "America/Marigot",
  "America/Martinique",
  "America/Mexico_City",
  "America/Miquelon",
  "America/Montevideo",
  "America/Montserrat",
  "America/Nassau",
  "America/New_York",
  "America/Noronha",
  "America/Nuuk",
  "America/Ojinaga",
  "America/Panama",
  "America/Paramaribo",
  "America/Phoenix",
  "America/Port-au-Prince",
  "America/Port_of_Spain",
  "America/Puerto_Rico",
  "America/Punta_Arenas",
  "America/Regina",
  "America/Rio_Branco",
  "America/Santiago",
  "America/Santo_Domingo",
  "America/Sao_Paulo",
  "America/Scoresbysund",
  "America/St_Barthelemy",
  "America/St_Johns",
  "America/St_Kitts",
  "America/St_Lucia",
  "America/St_Thomas",
  "America/St_Vincent",
  "America/Tegucigalpa",
  "America/Thule",
  "America/Tijuana",
  "America/Toronto",
  "America/Tortola",
  "America/Vancouver",
  "America/Whitehorse",
  "America/Winnipeg",
  "Antarctica/Casey",
  "Antarctica/Davis",
  "Antarctica/DumontDUrville",
  "Antarctica/Mawson",
  "Antarctica/McMurdo",
  "Antarctica/Palmer",
  "Antarctica/Syowa",
  "Antarctica/Troll",
  "Antarctica/Vostok",
  "Arctic/Longyearbyen",
  "Asia/Aden",
  "Asia/Almaty",
  "Asia/Amman",
  "Asia/Ashgabat",
  "Asia/Baghdad",
  "Asia/Bahrain",
  "Asia/Baku",
  "Asia/Bangkok",
  "Asia/Beirut",
  "Asia/Bishkek",
  "Asia/Brunei",
  "Asia/Chita",
  "Asia/Colombo",
  "Asia/Damascus",
  "Asia/Dhaka",
  "Asia/Dili",
  "Asia/Dubai",
  "Asia/Dushanbe",
  "Asia/Hebron",
  "Asia/Ho_Chi_Minh",
  "Asia/Hong_Kong",
  "Asia/Hovd",
  "Asia/Irkutsk",
  "Asia/Jakarta",
  "Asia/Jayapura",
  "Asia/Jerusalem",
  "Asia/Kabul",
  "Asia/Kamchatka",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Kuala_Lumpur",
  "Asia/Kuwait",
  "Asia/Macau",
  "Asia/Makassar",
  "Asia/Manila",
  "Asia/Muscat",
  "Asia/Nicosia",
  "Asia/Novosibirsk",
  "Asia/Omsk",
  "Asia/Phnom_Penh",
  "Asia/Pyongyang",
  "Asia/Qatar",
  "Asia/Qyzylorda",
  "Asia/Riyadh",
  "Asia/Sakhalin",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tashkent",
  "Asia/Tbilisi",
  "Asia/Tehran",
  "Asia/Thimphu",
  "Asia/Tokyo",
  "Asia/Ulaanbaatar",
  "Asia/Urumqi",
  "Asia/Vientiane",
  "Asia/Vladivostok",
  "Asia/Yangon",
  "Asia/Yekaterinburg",
  "Asia/Yerevan",
  "Atlantic/Azores",
  "Atlantic/Bermuda",
  "Atlantic/Canary",
  "Atlantic/Cape_Verde",
  "Atlantic/Faroe",
  "Atlantic/Reykjavik",
  "Atlantic/South_Georgia",
  "Atlantic/St_Helena",
  "Atlantic/Stanley",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Eucla",
  "Australia/Lord_Howe",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Andorra",
  "Europe/Athens",
  "Europe/Belgrade",
  "Europe/Berlin",
  "Europe/Bratislava",
  "Europe/Brussels",
  "Europe/Bucharest",
  "Europe/Budapest",
  "Europe/Chisinau",
  "Europe/Copenhagen",
  "Europe/Dublin",
  "Europe/Gibraltar",
  "Europe/Guernsey",
  "Europe/Helsinki",
  "Europe/Isle_of_Man",
  "Europe/Istanbul",
  "Europe/Jersey",
  "Europe/Kaliningrad",
  "Europe/Kiev",
  "Europe/Lisbon",
  "Europe/Ljubljana",
  "Europe/London",
  "Europe/Luxembourg",
  "Europe/Madrid",
  "Europe/Malta",
  "Europe/Mariehamn",
  "Europe/Minsk",
  "Europe/Monaco",
  "Europe/Moscow",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Podgorica",
  "Europe/Prague",
  "Europe/Riga",
  "Europe/Rome",
  "Europe/Samara",
  "Europe/San_Marino",
  "Europe/Sarajevo",
  "Europe/Simferopol",
  "Europe/Skopje",
  "Europe/Sofia",
  "Europe/Stockholm",
  "Europe/Tallinn",
  "Europe/Tirane",
  "Europe/Vaduz",
  "Europe/Vatican",
  "Europe/Vienna",
  "Europe/Vilnius",
  "Europe/Warsaw",
  "Europe/Zagreb",
  "Europe/Zurich",
  "Indian/Antananarivo",
  "Indian/Chagos",
  "Indian/Christmas",
  "Indian/Cocos",
  "Indian/Comoro",
  "Indian/Kerguelen",
  "Indian/Mahe",
  "Indian/Maldives",
  "Indian/Mauritius",
  "Indian/Mayotte",
  "Indian/Reunion",
  "Pacific/Apia",
  "Pacific/Auckland",
  "Pacific/Bougainville",
  "Pacific/Chatham",
  "Pacific/Chuuk",
  "Pacific/Easter",
  "Pacific/Efate",
  "Pacific/Fakaofo",
  "Pacific/Fiji",
  "Pacific/Funafuti",
  "Pacific/Galapagos",
  "Pacific/Gambier",
  "Pacific/Guadalcanal",
  "Pacific/Guam",
  "Pacific/Honolulu",
  "Pacific/Kiritimati",
  "Pacific/Kosrae",
  "Pacific/Majuro",
  "Pacific/Marquesas",
  "Pacific/Midway",
  "Pacific/Nauru",
  "Pacific/Niue",
  "Pacific/Norfolk",
  "Pacific/Noumea",
  "Pacific/Pago_Pago",
  "Pacific/Palau",
  "Pacific/Pitcairn",
  "Pacific/Port_Moresby",
  "Pacific/Rarotonga",
  "Pacific/Saipan",
  "Pacific/Tahiti",
  "Pacific/Tarawa",
  "Pacific/Tongatapu",
  "Pacific/Wake",
  "Pacific/Wallis",
] as const;

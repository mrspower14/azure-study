import fs from "fs";

// ── 데이터 로더 ───────────────────────────────────────────────────────────────

function loadEvents(filePath = "data/events.txt") {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const events = [];

  for (const line of lines) {
    const parts = line.trim().split("|");
    if (parts.length !== 4) continue;

    const [monthStr, dayStr] = parts[2].split("-").map(Number);
    events.push({
      name: parts[0],
      type: parts[1],
      sortKey: monthStr * 100 + dayStr,
      date: parts[2],
      locations: new Set(parts[3].split(";")),
    });
  }

  events.sort((a, b) => a.sortKey - b.sortKey);
  return events;
}

function loadRates(filePath) {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const rates = {};

  for (const line of lines) {
    const parts = line.trim().split("|");
    if (parts.length === 2) {
      rates[parts[0]] = parseFloat(parts[1]);
    }
  }

  return rates;
}

// ── 전역 데이터 ───────────────────────────────────────────────────────────────

const EVENTS = loadEvents();
const TELESCOPE_RATES = loadRates("data/telescope_rates.txt");
const PRIORITY_MULTIPLIERS = loadRates("data/priority_multipliers.txt");

// ── 함수 구현 ─────────────────────────────────────────────────────────────────

/**
 * 주어진 위치에서 다음에 볼 수 있는 천문 이벤트를 반환합니다.
 * @param {{ location: string }} params
 * @returns {string} JSON 문자열
 */
export function nextVisibleEvent({ location }) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const today = parseInt(`${month}${day}`, 10); // Python: int(datetime.now().strftime("%m%d"))

  const loc = location.toLowerCase().replace(/\s+/g, "_");

  // 올해 남은 이벤트 중 해당 위치 포함된 첫 번째 이벤트 탐색
  for (const event of EVENTS) {
    if (event.locations.has(loc) && event.sortKey >= today) {
      return JSON.stringify({
        event: event.name,
        type: event.type,
        date: event.date,
        visible_from: [...event.locations].sort(),
      });
    }
  }

  return JSON.stringify({
    message: `No upcoming events found for ${location}.`,
  });
}

/**
 * 망원경 관측 비용을 계산합니다.
 * @param {{ telescope_tier: string, hours: number, priority: string }} params
 * @returns {string} JSON 문자열
 */
export function calculateObservationCost({ telescope_tier, hours, priority }) {
  const tier = telescope_tier.toLowerCase();
  const pri = priority.toLowerCase();

  if (!(tier in TELESCOPE_RATES)) {
    return JSON.stringify({
      error: `Unknown telescope tier '${telescope_tier}'. Choose from: ${Object.keys(TELESCOPE_RATES).join(", ")}`,
    });
  }

  if (!(pri in PRIORITY_MULTIPLIERS)) {
    return JSON.stringify({
      error: `Unknown priority '${priority}'. Choose from: ${Object.keys(PRIORITY_MULTIPLIERS).join(", ")}`,
    });
  }

  if (hours <= 0) {
    return JSON.stringify({ error: "Hours must be greater than zero." });
  }

  const hourlyRate = TELESCOPE_RATES[tier];
  const multiplier = PRIORITY_MULTIPLIERS[pri];
  const baseCost = hourlyRate * hours;
  const totalCost = baseCost * multiplier;

  return JSON.stringify({
    telescope_tier: tier,
    hours,
    hourly_rate: hourlyRate,
    priority: pri,
    priority_multiplier: multiplier,
    base_cost: baseCost,
    total_cost: totalCost,
  });
}

/**
 * 천문 관측 세션 보고서를 생성하고 파일로 저장합니다.
 * @param {{ event_name: string, location: string, telescope_tier: string, hours: number, priority: string, observer_name: string }} params
 * @returns {string} JSON 문자열
 */
export function generateObservationReport({
  event_name,
  location,
  telescope_tier,
  hours,
  priority,
  observer_name,
}) {
  const costResult = JSON.parse(
    calculateObservationCost({ telescope_tier, hours, priority })
  );
  const eventResult = JSON.parse(nextVisibleEvent({ location }));

  if (costResult.error) {
    return JSON.stringify(costResult);
  }

  // Python: datetime.now().strftime("%Y-%m-%d %H:%M")
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace("T", " ")
    .substring(0, 16);

  // Python: f"report_{event_name.replace(' ', '_').lower()}_{timestamp.replace(':', '').replace(' ', '_')}.txt"
  const safeTimestamp = timestamp.replace(/:/g, "").replace(" ", "_");
  const safeName = event_name.replace(/\s+/g, "_").toLowerCase();
  const filename = `report_${safeName}_${safeTimestamp}.txt`;

  const report = `======================================
  CONTOSO OBSERVATORIES - SESSION REPORT
======================================
Date:           ${timestamp}
Observer:       ${observer_name}
Event:          ${event_name}
Location:       ${location}

NEXT VISIBLE EVENT
  Event:        ${eventResult.event ?? "N/A"}
  Date:         ${eventResult.date ?? "N/A"}

TELESCOPE BOOKING
  Tier:         ${costResult.telescope_tier}
  Hours:        ${costResult.hours}
  Hourly Rate:  $${costResult.hourly_rate.toFixed(2)}
  Priority:     ${costResult.priority}
  Multiplier:   ${costResult.priority_multiplier}x

COST SUMMARY
  Base Cost:    $${costResult.base_cost.toFixed(2)}
  Total Cost:   $${costResult.total_cost.toFixed(2)}
======================================
`;

  fs.writeFileSync(filename, report, "utf-8");

  return JSON.stringify({ status: "Report generated", file: filename });
}
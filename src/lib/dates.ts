// Date-only values belong to the user's calendar day, not the UTC day.
export function localISODate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const dateAtNoon = (date: string) => new Date(`${date}T12:00:00`)

export function weekStartISO(date = new Date()): string {
  const monday = new Date(date)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return localISODate(monday)
}

export function addDaysISO(date: string, days: number): string {
  const next = dateAtNoon(date)
  next.setDate(next.getDate() + days)
  return localISODate(next)
}

export function validTimeRange(start: string, end: string): boolean {
  const valid = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value)
    return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59)
  }
  return valid(start) && valid(end) && start < end
}

export function localTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

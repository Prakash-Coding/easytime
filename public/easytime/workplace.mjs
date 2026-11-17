export function validateWorkplace(location) {
  if (!location || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 ||
      !Number.isFinite(location.radius) || location.radius < 10 || location.radius > 10000) {
    throw new Error('Enter valid coordinates and a radius between 10 and 10,000 metres.');
  }
  return location;
}

export function distanceMetres(a, b) {
  const rad = n => n * Math.PI / 180;
  const dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function verifyPosition(workplace, position, now = Date.now()) {
  validateWorkplace(workplace);
  const c = position?.coords;
  if (!c || !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 ||
      !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180 ||
      !Number.isFinite(c.accuracy) || c.accuracy < 0 ||
      !Number.isFinite(position.timestamp) || now - position.timestamp > 60000 || position.timestamp > now + 5000) {
    throw new Error('A fresh, valid device location is required. Please try again.');
  }
  const distance = distanceMetres(workplace, c);
  if (distance > workplace.radius) throw new Error(`You are about ${Math.round(distance)} metres from the workplace, outside its ${workplace.radius} metre radius.`);
  if (distance + c.accuracy > workplace.radius) throw new Error('Location accuracy is too low to confirm you are inside the workplace. Move closer or retry outdoors.');
  return { distance: Math.round(distance), accuracy: Math.ceil(c.accuracy), checkedAt: new Date(now).toISOString() };
}

export function startClock(data, store, employee, position, now = Date.now(), id = crypto.randomUUID()) {
  if (!data.employees.some(e => e.id === employee && e.store === store)) throw new Error('Select an employee in this store.');
  if (data.clocks?.some(c => c.employee === employee)) throw new Error('This employee is already clocked in.');
  const workplace = data.stores.find(s => s.id === store)?.workplace;
  if (!workplace) throw new Error('Save the workplace location first.');
  const check = verifyPosition(workplace, position, now);
  return { id, store, employee, startedAt: new Date(now).toISOString(), workplace: { ...workplace }, check };
}

export function finishClock(clock, breaks, now = Date.now()) {
  const start = new Date(clock.startedAt), end = new Date(now);
  const minutes = (end - start) / 60000;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes >= 1440) throw new Error('Clocked shifts must be at least one minute and less than 24 hours. Use a manual entry for longer shifts.');
  if (!Number.isInteger(breaks) || breaks < 0 || breaks >= Math.floor(minutes)) throw new Error('Unpaid break must be whole minutes and shorter than the shift.');
  const pad = n => String(n).padStart(2, '0');
  const time = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { id: clock.id, store: clock.store, employee: clock.employee,
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    start: time(start), end: time(end), breaks, type: 'actual', status: 'pending',
    startedAt: clock.startedAt, endedAt: end.toISOString(),
    workplace: clock.workplace, locationCheck: clock.check };
}

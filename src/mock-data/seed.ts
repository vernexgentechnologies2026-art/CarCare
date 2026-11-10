/**
 * Fictional seed dataset (~1,200 households / 1,500 vehicles / 24 cleaners).
 * All names, phone numbers, registrations and prices are invented.
 * Deterministic for a given anchor date, so history and rollups are
 * regenerated instead of persisted (keeps localStorage small).
 */
import { BLOCKS } from '@/constants';
import type {
  AuditEntry,
  CarSize,
  Cleaner,
  Customer,
  ISODate,
  Invoice,
  MonthlyWashRollup,
  Payment,
  PaymentMethod,
  RescheduleRequest,
  SchedulePattern,
  Vehicle,
  WashPackage,
  WashRecord,
} from '@/types';
import { addDays, cycleOf, dateRange, firstDayOfCycle, lastDayOfCycle, previousCycle } from '@/utils/dates';
import { invoiceStatusFor } from '@/utils/invoiceCalculator';
import { isScheduledOn } from '@/utils/scheduleRules';
import { DEMO_ADMIN_PHONE, DEMO_CUSTOMER_PHONE, DEMO_PASSWORD, DEMO_PENDING_CUSTOMER_PHONE, type MockAccount } from './accounts';
import {
  CLEANER_NAMES,
  COLORS,
  FIRST,
  INSTRUCTIONS,
  LAST,
  MODELS,
  NOT_PRESENT_NOTES,
  PACKAGE_CATALOGUE,
  RTO,
  SERIES_LETTERS,
  SOCIETY_ADDRESS,
  TIME_RESTRICTIONS,
} from './fixtures';
import { createRng, type Rng } from './prng';

export interface SeedData {
  accounts: MockAccount[];
  packages: WashPackage[];
  cleaners: Cleaner[];
  customers: Customer[];
  vehicles: Vehicle[];
  washRecords: WashRecord[];
  rollups: MonthlyWashRollup[];
  reschedules: RescheduleRequest[];
  invoices: Invoice[];
  payments: Payment[];
  audit: AuditEntry[];
}

/** Index of the first pending registration — the demo "pending approval" resident. */
const FIRST_PENDING = 1181;
/** Archived months kept as rollups (before the detailed two-month window). */
const ROLLUP_MONTHS = 4;

function registration(rng: Rng, used: Set<string>): string {
  for (;;) {
    const series = rng.pick([...SERIES_LETTERS]) + rng.pick([...SERIES_LETTERS]);
    const reg = `${rng.pick(RTO)}-${series}-${String(rng.int(1, 9999)).padStart(4, '0')}`;
    if (!used.has(reg)) {
      used.add(reg);
      return reg;
    }
  }
}

function pickPattern(rng: Rng): SchedulePattern {
  const r = rng.next();
  if (r < 0.2) return 'DAILY';
  if (r < 0.6) return 'MON_WED_FRI';
  if (r < 0.85) return 'TUE_FRI';
  return 'THU_ONLY';
}

/** Timestamp on `date` at the given local hour/minute. */
function at(date: ISODate, hour: number, minute: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, hour, minute).toISOString();
}

function scheduledDaysIn(pattern: SchedulePattern, cycle: string): number {
  return dateRange(firstDayOfCycle(cycle), lastDayOfCycle(cycle)).filter((d) => isScheduledOn(pattern, d)).length;
}

export function buildSeed(today: ISODate): SeedData {
  const rng = createRng(20261110);
  const accounts: MockAccount[] = [];

  /* Packages — multi-size compatibility, placeholder prices. */
  const packages: WashPackage[] = PACKAGE_CATALOGUE.map((p) => ({
    ...p,
    carSizes: [...p.carSizes],
    features: [...p.features],
    description: 'Fictional placeholder package for UI review.',
    active: true,
  }));
  const packageFor = (size: CarSize, pattern: SchedulePattern): WashPackage => {
    const p = packages.find((x) => x.schedulePattern === pattern && x.carSizes.includes(size));
    if (!p) throw new Error('package missing');
    return p;
  };

  /* Cleaners: 4 per block. */
  const cleaners: Cleaner[] = CLEANER_NAMES.map((name, i) => ({
    id: `cl_${i + 1}`,
    name,
    phone: String(9000000101 + i),
    active: true,
    assignedBlocks: [BLOCKS[Math.floor(i / 4)] ?? 'A'],
  }));
  for (const c of cleaners) {
    accounts.push({ id: `acc_${c.id}`, role: 'CLEANER', phone: c.phone, password: DEMO_PASSWORD, displayName: c.name, customerId: null, cleanerId: c.id });
  }
  accounts.push({ id: 'acc_admin_1', role: 'ADMIN', phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD, displayName: 'Facility Admin', customerId: null, cleanerId: null });

  /* Households: 6 blocks × 25 floors × 8 flats = 1,200. First 300 own two cars. */
  const customers: Customer[] = [];
  const vehicles: Vehicle[] = [];
  const usedRegs = new Set<string>();
  const historyStart = firstDayOfCycle(previousCycle(cycleOf(today)));
  let n = 0;
  for (let floor = 1; floor <= 25; floor++) {
    for (let unit = 1; unit <= 8; unit++) {
      for (const block of BLOCKS) {
        n += 1;
        const id = `cus_${n}`;
        let status: Customer['status'] = 'ACTIVE';
        if (n >= FIRST_PENDING) status = 'PENDING_APPROVAL';
        else if (n > 1176) status = 'REJECTED';
        else if (n % 61 === 0) status = 'PAUSED';
        const name = n === 1 ? 'Arjun Raghavan' : n === FIRST_PENDING ? 'Meera Subramanian' : `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
        const phone = n === 1 ? DEMO_CUSTOMER_PHONE : n === FIRST_PENDING ? DEMO_PENDING_CUSTOMER_PHONE : String(9000001000 + n);
        const createdOn = status === 'PENDING_APPROVAL' ? addDays(today, -rng.int(0, 4)) : addDays(historyStart, -rng.int(30, 400));
        customers.push({
          id,
          name,
          phone,
          block,
          flat: `${floor}${String(unit).padStart(2, '0')}`,
          address: SOCIETY_ADDRESS,
          status,
          createdAt: at(createdOn, 9, rng.int(0, 59)),
          rejectionReason: status === 'REJECTED' ? 'Flat number does not match society records.' : null,
        });
        accounts.push({ id: `acc_${id}`, role: 'CUSTOMER', phone, password: DEMO_PASSWORD, displayName: name, customerId: id, cleanerId: null });

        const blockCleaners = cleaners.filter((c) => c.assignedBlocks.includes(block));
        const carCount = n <= 300 ? 2 : 1;
        for (let k = 0; k < carCount; k++) {
          const [makeModel, size] = rng.pick(MODELS);
          const pattern = n === 1 && k === 0 ? 'MON_WED_FRI' : pickPattern(rng);
          const approved = status !== 'PENDING_APPROVAL' && status !== 'REJECTED';
          vehicles.push({
            id: `veh_${vehicles.length + 1}`,
            customerId: id,
            registration: registration(rng, usedRegs),
            carSize: size,
            makeModel,
            color: rng.pick(COLORS),
            // Pending registrations choose a package after approval.
            packageId: approved ? packageFor(size, pattern).id : null,
            cleanerId: !approved ? null : n === 1 ? 'cl_1' : (blockCleaners[(n + k) % blockCleaners.length]?.id ?? null),
            parkingSlot: `B${rng.int(1, 2)}-${block}-${String(rng.int(1, 160)).padStart(3, '0')}`,
            timeRestriction: rng.chance(0.25) ? rng.pick(TIME_RESTRICTIONS) : null,
            instructions: rng.chance(0.15) ? rng.pick(INSTRUCTIONS) : null,
          });
        }
      }
    }
  }

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const packageById = new Map(packages.map((p) => [p.id, p]));

  /* Detailed wash history from the start of last cycle through today. */
  const washRecords: WashRecord[] = [];
  const days = dateRange(historyStart, today);
  for (const v of vehicles) {
    const owner = customerById.get(v.customerId);
    const pkg = v.packageId ? packageById.get(v.packageId) : undefined;
    if (!owner || !pkg || owner.status !== 'ACTIVE' || !v.cleanerId) continue;
    for (const date of days) {
      if (!isScheduledOn(pkg.schedulePattern, date)) continue;
      // Today: other cleaners are part-way through their round; the demo cleaner has not started.
      if (date === today && (v.cleanerId === 'cl_1' || !rng.chance(0.45))) continue;
      const notPresent = rng.chance(0.06);
      washRecords.push({
        id: `wr_${washRecords.length + 1}`,
        jobId: `${v.id}_${date}`,
        vehicleId: v.id,
        cleanerId: v.cleanerId,
        scheduledDate: date,
        status: notPresent ? 'VEHICLE_NOT_PRESENT' : 'COMPLETED',
        recordedAt: at(date, rng.int(5, 9), rng.int(0, 59)),
        photoId: notPresent ? null : `seed:${v.id}:${date}`,
        note: notPresent ? rng.pick(NOT_PRESENT_NOTES) : null,
      });
    }
  }

  /* Archived months as rollups (photos past retention are no longer stored). */
  const rollups: MonthlyWashRollup[] = [];
  let archived = previousCycle(cycleOf(historyStart));
  const archivedCycles: string[] = [];
  for (let i = 0; i < ROLLUP_MONTHS; i++) {
    archivedCycles.push(archived);
    archived = previousCycle(archived);
  }
  for (const v of vehicles) {
    const owner = customerById.get(v.customerId);
    const pkg = v.packageId ? packageById.get(v.packageId) : undefined;
    if (!owner || !pkg || owner.status === 'PENDING_APPROVAL' || owner.status === 'REJECTED') continue;
    for (const cycle of archivedCycles) {
      if (firstDayOfCycle(cycle) < owner.createdAt.slice(0, 10)) continue;
      const scheduled = scheduledDaysIn(pkg.schedulePattern, cycle);
      const vnp = Math.round(scheduled * rng.next() * 0.12);
      rollups.push({ vehicleId: v.id, cycle, completed: scheduled - vnp, vehicleNotPresent: vnp, photosArchived: scheduled - vnp });
    }
  }

  /* Reschedule requests against recent "vehicle not present" records. */
  const reschedules: RescheduleRequest[] = [];
  const recentMisses = washRecords.filter((r) => r.status === 'VEHICLE_NOT_PRESENT' && r.scheduledDate >= addDays(today, -6) && r.scheduledDate < today);
  recentMisses.slice(0, 9).forEach((r, i) => {
    const v = vehicles.find((x) => x.id === r.vehicleId);
    if (!v) return;
    reschedules.push({
      id: `rs_${i + 1}`,
      customerId: v.customerId,
      vehicleId: v.id,
      missedDate: r.scheduledDate,
      requestedDate: addDays(today, 1 + (i % 4)),
      reason: rng.pick(['Was travelling', 'Car was at service centre', 'Guests used the car', 'Parked outside that day']),
      status: i < 6 ? 'REQUESTED' : i < 8 ? 'APPROVED' : 'REJECTED',
      createdAt: at(addDays(r.scheduledDate, 1), 19, rng.int(0, 59)),
      resolvedAt: i < 6 ? null : at(addDays(r.scheduledDate, 2), 10, 15),
      adminNote: i === 8 ? 'Requested date is fully booked — please pick another day.' : null,
    });
  });

  /* Invoices for the previous and current cycle, one per subscribed vehicle. */
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const methods: PaymentMethod[] = ['UPI', 'UPI', 'UPI', 'CARD', 'NET_BANKING'];
  const reference = () => `MOCK-${String(payments.length + 1).padStart(8, '0')}`;
  let invNo = 1;
  for (const cycle of [previousCycle(cycleOf(today)), cycleOf(today)]) {
    const isCurrent = cycle === cycleOf(today);
    for (const v of vehicles) {
      const owner = customerById.get(v.customerId);
      const pkg = v.packageId ? packageById.get(v.packageId) : undefined;
      if (!owner || !pkg || owner.status === 'PENDING_APPROVAL' || owner.status === 'REJECTED') continue;
      const issuedOn = firstDayOfCycle(cycle);
      const dueOn = addDays(issuedOn, 9);
      const paid = owner.id === 'cus_1' ? !isCurrent : isCurrent ? rng.chance(0.62) : rng.chance(0.96);
      const invoice: Invoice = {
        id: `inv_${invNo}`,
        number: `CC-${cycle.replace('-', '')}-${String(invNo).padStart(5, '0')}`,
        customerId: owner.id,
        vehicleId: v.id,
        cycle,
        issuedOn,
        dueOn,
        amount: pkg.monthlyPrice,
        amountPaid: 0,
        status: 'DUE',
        overrideNote: null,
      };
      invNo += 1;
      const payDate = addDays(issuedOn, rng.int(0, 8));
      if (paid && payDate <= today) {
        if (rng.chance(0.08) || owner.id === 'cus_1') {
          payments.push({
            id: `pay_${payments.length + 1}`,
            invoiceId: invoice.id,
            customerId: owner.id,
            amount: invoice.amount,
            method: 'CARD',
            status: 'FAILED',
            reference: reference(),
            createdAt: at(payDate, 20, 2),
            failureReason: 'Simulated decline from the mock gateway.',
            simulated: true,
          });
        }
        payments.push({
          id: `pay_${payments.length + 1}`,
          invoiceId: invoice.id,
          customerId: owner.id,
          amount: invoice.amount,
          method: rng.pick(methods),
          status: 'SUCCESS',
          reference: reference(),
          createdAt: at(payDate, 20, 10),
          failureReason: null,
          simulated: true,
        });
        invoice.amountPaid = invoice.amount;
      }
      invoice.status = invoiceStatusFor(invoice, today);
      invoices.push(invoice);
    }
  }

  /* Audit trail: recent payments and resolved reschedules, newest first. */
  const audit: AuditEntry[] = [];
  const nameOf = new Map(customers.map((c) => [c.id, c.name]));
  for (const p of payments.filter((x) => x.createdAt >= at(addDays(today, -10), 0, 0)).slice(-40)) {
    audit.push({
      id: `au_${audit.length + 1}`,
      at: p.createdAt,
      actorId: `acc_${p.customerId}`,
      actorName: nameOf.get(p.customerId) ?? 'Resident',
      actorRole: 'CUSTOMER',
      action: p.status === 'SUCCESS' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
      entityType: 'PAYMENT',
      entityId: p.id,
      summary: `${p.status === 'SUCCESS' ? 'Paid' : 'Payment failed for'} ₹${p.amount} via ${p.method.replace('_', ' ')} (simulated)`,
    });
  }
  for (const r of reschedules.filter((x) => x.resolvedAt)) {
    audit.push({
      id: `au_${audit.length + 1}`,
      at: r.resolvedAt ?? r.createdAt,
      actorId: 'acc_admin_1',
      actorName: 'Facility Admin',
      actorRole: 'ADMIN',
      action: r.status === 'APPROVED' ? 'RESCHEDULE_APPROVED' : 'RESCHEDULE_REJECTED',
      entityType: 'RESCHEDULE',
      entityId: r.id,
      summary: `${r.status === 'APPROVED' ? 'Approved' : 'Rejected'} reschedule for ${nameOf.get(r.customerId) ?? 'resident'} to ${r.requestedDate}`,
    });
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));

  return { accounts, packages, cleaners, customers, vehicles, washRecords, rollups, reschedules, invoices, payments, audit };
}

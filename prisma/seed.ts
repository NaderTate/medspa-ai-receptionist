// Seeds a realistic demo med spa: providers, services, a few customers (one a
// returning regular with history), some existing appointments, and a waitlist
// entry positioned so the "cancel frees a slot -> auto-text the waitlist" demo
// works out of the box.
//
// Run with: bun run seed
// Safe to re-run: it clears the tables first, so you always get a clean demo.

import { prisma } from '../src/lib/db.js';
import { addMinutes, startOfDay } from '../src/lib/time.js';

// Returns a Date N days from today at the given hour:minute.
function dayFromNow(days: number, hour: number, minute = 0): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  // Clear in dependency order (children before parents).
  await prisma.waitlistEntry.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.customer.deleteMany();

  const [lena, marcus] = await Promise.all([
    prisma.staffMember.create({ data: { name: 'Dr. Lena Ortiz', title: 'Nurse Injector' } }),
    prisma.staffMember.create({ data: { name: 'Marcus Webb', title: 'Aesthetician' } }),
  ]);

  const services = await Promise.all([
    prisma.service.create({ data: { name: 'Botox', description: 'Wrinkle-relaxing injectable treatment', durationMinutes: 30, priceCents: 60000 } }),
    prisma.service.create({ data: { name: 'Lip Filler', description: 'Hyaluronic acid lip enhancement', durationMinutes: 45, priceCents: 75000 } }),
    prisma.service.create({ data: { name: 'HydraFacial', description: 'Deep-cleansing hydrating facial', durationMinutes: 60, priceCents: 25000 } }),
    prisma.service.create({ data: { name: 'Chemical Peel', description: 'Exfoliating skin-resurfacing treatment', durationMinutes: 45, priceCents: 18000 } }),
    prisma.service.create({ data: { name: 'Microneedling', description: 'Collagen-induction skin therapy', durationMinutes: 60, priceCents: 35000 } }),
  ]);
  const botox = services[0]!;
  const hydrafacial = services[2]!;

  // Returning regular with history — this is who the "remembers you" demo calls as.
  const sarah = await prisma.customer.create({
    data: {
      fullName: 'Sarah Chen',
      phone: '+15551230001',
      email: 'sarah.chen@example.com',
      notes: 'Regular Botox client. Prefers Dr. Lena. Mild latex sensitivity.',
    },
  });

  // Waitlisted client — gets auto-texted when Sarah cancels tomorrow's Botox.
  const maria = await prisma.customer.create({
    data: { fullName: 'Maria Lopez', phone: '+15551230002', notes: 'Keen for an earlier Botox slot.' },
  });

  // A brand-new caller is intentionally NOT in the DB, so you can demo the
  // "unknown caller -> register new customer" path live.

  // Sarah's past visit (history the agent can reference) + her upcoming Botox.
  await prisma.appointment.create({
    data: {
      customerId: sarah.id,
      serviceId: botox.id,
      staffId: lena.id,
      startTime: dayFromNow(-30, 11, 0),
      endTime: addMinutes(dayFromNow(-30, 11, 0), botox.durationMinutes),
      status: 'COMPLETED',
    },
  });
  await prisma.appointment.create({
    data: {
      customerId: sarah.id,
      serviceId: botox.id,
      staffId: lena.id,
      startTime: dayFromNow(1, 14, 0),
      endTime: addMinutes(dayFromNow(1, 14, 0), botox.durationMinutes),
      status: 'BOOKED',
    },
  });

  // Maria waits for Botox any time in the next week — tomorrow is inside her window.
  await prisma.waitlistEntry.create({
    data: {
      customerId: maria.id,
      serviceId: botox.id,
      earliestDate: startOfDay(new Date()),
      latestDate: dayFromNow(7, 23, 59),
      status: 'WAITING',
    },
  });

  // A little background traffic so availability isn't wide open.
  await prisma.appointment.create({
    data: {
      customerId: maria.id,
      serviceId: hydrafacial.id,
      staffId: marcus.id,
      startTime: dayFromNow(2, 10, 0),
      endTime: addMinutes(dayFromNow(2, 10, 0), hydrafacial.durationMinutes),
      status: 'BOOKED',
    },
  });

  // More clients + a week of appointments so the dashboard agenda has real
  // volume to group by day and scroll through.
  const lipFiller = services[1]!;
  const peel = services[3]!;
  const microneedling = services[4]!;

  const [priya, chloe, james, ava, noah, sofia] = await Promise.all([
    prisma.customer.create({ data: { fullName: 'Priya Nair', phone: '+15551230003', notes: 'HydraFacial regular.' } }),
    prisma.customer.create({ data: { fullName: 'Chloe Bennett', phone: '+15551230004', notes: 'First lip filler, nervous, reassure.' } }),
    prisma.customer.create({ data: { fullName: 'James Okafor', phone: '+15551230005' } }),
    prisma.customer.create({ data: { fullName: 'Ava Romano', phone: '+15551230006', notes: 'Prefers afternoons.' } }),
    prisma.customer.create({ data: { fullName: 'Noah Park', phone: '+15551230007' } }),
    prisma.customer.create({ data: { fullName: 'Sofia Reyes', phone: '+15551230008', notes: 'Sensitive skin, patch test done.' } }),
  ]);

  const s = { botox: botox.id, lip: lipFiller.id, facial: hydrafacial.id, peel: peel.id, micro: microneedling.id };
  const who = { lena: lena.id, marcus: marcus.id };

  // [customerId, serviceId, staffId, dayOffset, hour, minute]
  const bookings: Array<[string, string, string, number, number, number]> = [
    [priya.id, s.facial, who.marcus, 0, 10, 0],
    [chloe.id, s.lip, who.lena, 0, 12, 30],
    [james.id, s.micro, who.marcus, 0, 15, 30],
    [ava.id, s.peel, who.lena, 0, 17, 0],
    [noah.id, s.facial, who.marcus, 1, 9, 30],
    [sofia.id, s.botox, who.lena, 1, 11, 0],
    [ava.id, s.lip, who.lena, 1, 16, 0],
    [chloe.id, s.micro, who.marcus, 2, 13, 0],
    [priya.id, s.botox, who.lena, 2, 15, 0],
    [james.id, s.facial, who.marcus, 3, 11, 0],
    [sofia.id, s.peel, who.lena, 3, 14, 30],
    [noah.id, s.botox, who.lena, 3, 16, 30],
    [ava.id, s.facial, who.marcus, 4, 10, 30],
    [chloe.id, s.botox, who.lena, 4, 13, 0],
    [priya.id, s.micro, who.marcus, 5, 12, 0],
    [sofia.id, s.lip, who.lena, 5, 15, 0],
  ];
  for (const [customerId, serviceId, staffId, day, hour, minute] of bookings) {
    const svc = services.find((x) => x.id === serviceId)!;
    const startTime = dayFromNow(day, hour, minute);
    await prisma.appointment.create({
      data: { customerId, serviceId, staffId, startTime, endTime: addMinutes(startTime, svc.durationMinutes), status: 'BOOKED' },
    });
  }

  console.log('Seeded:');
  console.log(`  2 providers, ${services.length} services, 8 customers`);
  console.log(`  ${bookings.length + 2} booked appointments across the next 6 days`);
  console.log(`  Sarah Chen (+15551230001) — returning, Botox tomorrow 2:00 PM (the cancel demo)`);
  console.log(`  Maria Lopez (+15551230002) — waitlisted for Botox this week`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

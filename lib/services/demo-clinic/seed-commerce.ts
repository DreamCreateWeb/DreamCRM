import 'server-only'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

// Shop catalog, orders and memberships.

// ── Shop seeding (catalog only; orders/coupons/memberships in later slices) ──
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. 6 products across categories + statuses, 7 variants.
export async function seedDemoShop(orgId: string, now: Date, patientIds: string[] = []) {
  await db
    .insert(schema.shopConfig)
    .values({
      organizationId: orgId,
      pickupEnabled: 1,
      shippingEnabled: 1,
      taxEnabled: 0,
      storefrontEnabled: 1,
      membershipEnabled: 1,
      stripeAccountStatus: 'none',
    })
    .onConflictDoNothing({ target: schema.shopConfig.organizationId })

  const whiteningId = newId('prod')
  const brushId = newId('prod')
  const flosserId = newId('prod')
  const pensId = newId('prod')
  const kidsId = newId('prod')
  const merchId = newId('prod')

  await db.insert(schema.shopProduct).values([
    {
      id: whiteningId,
      organizationId: orgId,
      name: 'Professional Whitening Kit',
      slug: 'professional-whitening-kit',
      description:
        'Dentist-dispensed take-home whitening with professional-strength gel and a comfortable tray. Noticeably whiter in about two weeks — far stronger than anything off the shelf.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 1,
      position: 0,
    },
    {
      id: brushId,
      organizationId: orgId,
      name: 'Sonic Electric Toothbrush',
      slug: 'sonic-electric-toothbrush',
      description: 'The brush we recommend to every patient — sonic cleaning, 2-minute timer, and a pressure sensor so you do not brush too hard.',
      category: 'brushes',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 1,
      featured: 1,
      position: 1,
    },
    {
      id: flosserId,
      organizationId: orgId,
      name: 'Cordless Water Flosser',
      slug: 'cordless-water-flosser',
      description: 'Great for braces, implants, and anyone who finds string floss a chore. Rechargeable and travel-friendly.',
      category: 'flossers',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 2,
    },
    {
      id: pensId,
      organizationId: orgId,
      name: 'Whitening Touch-Up Pens (3-pack)',
      slug: 'whitening-touch-up-pens',
      description: 'Keep your results bright between visits. Pop one in your bag for quick touch-ups.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 3,
    },
    {
      id: kidsId,
      organizationId: orgId,
      name: 'Kids Brush + 2-Minute Timer Set',
      slug: 'kids-brush-timer-set',
      description: 'Makes brushing fun and gets them to the full two minutes. Soft bristles sized for little mouths.',
      category: 'kids',
      images: [],
      status: 'draft',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 4,
    },
    {
      id: merchId,
      organizationId: orgId,
      name: 'Branded Travel Care Kit',
      slug: 'branded-travel-care-kit',
      description: 'Travel toothbrush, mini paste, and floss in a clinic-branded zip pouch.',
      category: 'merch',
      images: [],
      status: 'archived',
      fulfillment: 'pickup',
      fsaEligible: 0,
      featured: 0,
      position: 5,
    },
  ])

  const whiteningStdVar = newId('var')
  const brushVar = newId('var')
  const flosserVar = newId('var')
  const pensVar = newId('var')
  await db.insert(schema.shopProductVariant).values([
    { id: whiteningStdVar, productId: whiteningId, organizationId: orgId, name: 'Standard', priceCents: 14900, inventoryQty: 25, position: 0 },
    { id: newId('var'), productId: whiteningId, organizationId: orgId, name: 'Sensitive formula', priceCents: 14900, inventoryQty: 12, position: 1 },
    { id: brushVar, productId: brushId, organizationId: orgId, name: 'Default', priceCents: 8900, compareAtCents: 11900, inventoryQty: 40, position: 0 },
    { id: flosserVar, productId: flosserId, organizationId: orgId, name: 'Default', priceCents: 5900, inventoryQty: 18, position: 0 },
    { id: pensVar, productId: pensId, organizationId: orgId, name: 'Default', priceCents: 2900, inventoryQty: null, position: 0 },
    { id: newId('var'), productId: kidsId, organizationId: orgId, name: 'Default', priceCents: 1900, inventoryQty: 30, position: 0 },
    { id: newId('var'), productId: merchId, organizationId: orgId, name: 'Default', priceCents: 1500, inventoryQty: null, position: 0 },
  ])

  // Orders covering pickup/ship + paid/pending states. First linked to a
  // patient when one is available (new-seed path); the rest are guest orders.
  const dayMs = 24 * 60 * 60 * 1000
  const o1 = newId('ord')
  const o2 = newId('ord')
  const o3 = newId('ord')
  await db.insert(schema.shopOrder).values([
    {
      id: o1,
      organizationId: orgId,
      patientId: patientIds[2] ?? null,
      email: 'sophia.martinez@example.com',
      name: 'Sophia Martinez',
      fulfillmentType: 'pickup',
      status: 'paid',
      fulfillmentStatus: 'ready_for_pickup',
      subtotalCents: 14900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 14900,
      paidAt: new Date(now.getTime() - 2 * dayMs),
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      id: o2,
      organizationId: orgId,
      email: 'guest.buyer@example.com',
      name: 'Daniel Park',
      fulfillmentType: 'ship',
      status: 'paid',
      fulfillmentStatus: 'shipped',
      subtotalCents: 14800,
      shippingCents: 600,
      taxCents: 0,
      totalCents: 15400,
      trackingNumber: '9400110200000000000000',
      shippingAddress: { line1: '500 Cedar St', city: 'Austin', state: 'TX', postal_code: '78704', country: 'US' },
      paidAt: new Date(now.getTime() - 5 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: o3,
      organizationId: orgId,
      email: 'window.shopper@example.com',
      fulfillmentType: 'pickup',
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
      subtotalCents: 2900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 2900,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  ])
  // A paid order that's STILL unfulfilled — drives the Overview "Orders to
  // fulfill" attention card + a shop_order timeline event on Emma's record.
  const o4 = newId('ord')
  await db.insert(schema.shopOrder).values({
    id: o4,
    organizationId: orgId,
    patientId: patientIds[0] ?? null,
    email: 'emma.lopez@example.com',
    name: 'Emma Lopez',
    fulfillmentType: 'ship',
    status: 'paid',
    fulfillmentStatus: 'unfulfilled',
    subtotalCents: 8900,
    shippingCents: 600,
    taxCents: 0,
    totalCents: 9500,
    shippingAddress: { line1: '210 Oak Ln', city: 'Austin', state: 'TX', postal_code: '78702', country: 'US' },
    paidAt: new Date(now.getTime() - 1 * dayMs),
    createdAt: new Date(now.getTime() - 1 * dayMs),
  })
  await db.insert(schema.shopOrderItem).values([
    { id: `oi_${newId('x')}`, orderId: o1, organizationId: orgId, variantId: whiteningStdVar, productName: 'Professional Whitening Kit', variantName: 'Standard', unitPriceCents: 14900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: brushVar, productName: 'Sonic Electric Toothbrush', variantName: null, unitPriceCents: 8900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: flosserVar, productName: 'Cordless Water Flosser', variantName: null, unitPriceCents: 5900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o3, organizationId: orgId, variantId: pensVar, productName: 'Whitening Touch-Up Pens (3-pack)', variantName: null, unitPriceCents: 2900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o4, organizationId: orgId, variantId: brushVar, productName: 'Sonic Electric Toothbrush', variantName: null, unitPriceCents: 8900, quantity: 1 },
  ])

  // An online balance payment (patient paid toward their PMS balance) so the
  // /payments/online reconciliation page + the patient timeline have real data.
  // FK requires a patient, so only when one exists.
  if (patientIds[0]) {
    await db.insert(schema.patientBalancePayment).values({
      id: `bp_${newId('x')}`,
      organizationId: orgId,
      patientId: patientIds[0],
      amountCents: 12000,
      status: 'paid',
      balanceCentsAtPayment: 35000,
      paidAt: new Date(now.getTime() - 3 * dayMs),
      createdAt: new Date(now.getTime() - 3 * dayMs),
    })
  }

  // Coupons: 2 open promo codes + (when a patient exists) a single-use
  // birthday code, so the coupons page shows manual + birthday sources.
  const coupons: Array<typeof schema.shopCoupon.$inferInsert> = [
    { id: newId('coupon'), organizationId: orgId, code: 'WELCOME10', discountType: 'percent', discountValue: 10, source: 'manual', singleUse: 0 },
    { id: newId('coupon'), organizationId: orgId, code: 'SUMMER25', discountType: 'amount', discountValue: 2500, source: 'manual', singleUse: 0, minSubtotalCents: 10000, expiresAt: new Date(now.getTime() + 60 * dayMs) },
  ]
  if (patientIds[0]) {
    coupons.push({ id: newId('coupon'), organizationId: orgId, code: 'BDAY-7F3A2C', discountType: 'percent', discountValue: 15, source: 'birthday', singleUse: 1, patientId: patientIds[0], expiresAt: new Date(now.getTime() + 45 * dayMs) })
  }
  await db.insert(schema.shopCoupon).values(coupons)
}

// ── Membership plans + members (pure inserts) ───────────────────────────────
// Memberships need a patient (NOT NULL FK), so members are seeded only for the
// patientIds passed in. Plans seed regardless.
export async function seedDemoMemberships(orgId: string, now: Date, patientIds: string[]) {
  const dayMs = 24 * 60 * 60 * 1000
  const smileId = newId('mplan')
  const liteId = newId('mplan')
  await db.insert(schema.membershipPlan).values([
    {
      id: smileId,
      organizationId: orgId,
      name: 'Smile Club',
      slug: 'smile-club',
      description:
        'No insurance? No problem. Your preventive care for one simple yearly fee — plus 15% off everything else. No deductibles, no claim forms, no waiting periods.',
      billingInterval: 'annual',
      priceCents: 39900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
        { label: '1 emergency visit', qty: 1 },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 1,
      position: 0,
    },
    {
      id: liteId,
      organizationId: orgId,
      name: 'Smile Club Monthly',
      slug: 'smile-club-monthly',
      description: 'The same coverage, spread across the year.',
      billingInterval: 'monthly',
      priceCents: 3900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 0,
      position: 1,
    },
  ])

  const members: Array<{ patientId: string | undefined; status: string; benefitsUsed: Record<string, number>; offset: number }> = [
    { patientId: patientIds[0], status: 'active', benefitsUsed: { '2 cleanings per year': 1 } as Record<string, number>, offset: 250 },
    { patientId: patientIds[1], status: 'active', benefitsUsed: {} as Record<string, number>, offset: 320 },
    { patientId: patientIds[4], status: 'past_due', benefitsUsed: { '2 cleanings per year': 2, '2 exams per year': 1 } as Record<string, number>, offset: 12 },
  ].filter((m) => Boolean(m.patientId))
  if (members.length > 0) {
    await db.insert(schema.membership).values(
      members.map((m) => ({
        id: newId('mem'),
        organizationId: orgId,
        planId: smileId,
        patientId: m.patientId as string,
        status: m.status,
        stripeSubscriptionId: `sub_demo_${newId('x')}`,
        benefitsUsed: m.benefitsUsed,
        currentPeriodStart: new Date(now.getTime() - (365 - m.offset) * dayMs),
        currentPeriodEnd: new Date(now.getTime() + m.offset * dayMs),
        startedAt: new Date(now.getTime() - (365 - m.offset) * dayMs),
      })),
    )
  }
}

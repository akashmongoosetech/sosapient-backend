// One-off, idempotent index repair for the Payment collection.
//
// The original schema made `razorpayPaymentId` a unique index with
// `partialFilterExpression: { $exists: true }`, while every pending payment was
// written with `razorpayPaymentId: ''`. Because `''` exists, only ONE payment
// document could be stored with an empty id — the second enrollment (free or
// pending paid) failed with E11000.
//
// `transactionId` was also unique on Payment even though a retried payment for
// the same enrollment legitimately reuses the enrollment's transaction id.
//
// This runs at boot, drops only the two known-bad index definitions when they
// still exist, clears legacy empty ids, and rebuilds the indexes. Safe to run
// repeatedly.
async function migratePaymentIndexes() {
  const Payment = require('../models/Payment');
  const collection = Payment.collection;

  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch {
    // Collection may not exist yet; createIndexes below will create it.
  }

  const byName = new Map(indexes.map((idx) => [idx.name, idx]));

  const rzpIndex = byName.get('razorpayPaymentId_1');
  const rzpFilters = JSON.stringify(rzpIndex && rzpIndex.partialFilterExpression);
  const rzpExpected = JSON.stringify({ razorpayPaymentId: { $gt: '' } });
  if (rzpIndex && (rzpFilters !== rzpExpected || rzpIndex.unique !== true)) {
    try {
      await collection.dropIndex('razorpayPaymentId_1');
    } catch (error) {
      if (error && error.code !== 27) {
        console.warn('Payment index migration: could not drop razorpayPaymentId_1:', error.message);
      }
    }
  }

  const txnIndex = byName.get('transactionId_1');
  if (txnIndex && txnIndex.unique) {
    try {
      await collection.dropIndex('transactionId_1');
    } catch (error) {
      if (error && error.code !== 27) {
        console.warn('Payment index migration: could not drop transactionId_1:', error.message);
      }
    }
  }

  // Legacy rows wrote '' instead of leaving the field out. Unset them so they
  // can never collide once the unique index is rebuilt.
  try {
    await collection.updateMany(
      { razorpayPaymentId: '' },
      { $unset: { razorpayPaymentId: '' } }
    );
  } catch (error) {
    console.warn('Payment index migration: could not clear empty payment ids:', error.message);
  }

  await Payment.createIndexes();
}

module.exports = { migratePaymentIndexes };

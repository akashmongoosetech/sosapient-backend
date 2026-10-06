const Deal = require('../models/deal.model');
const Lead = require('../models/lead.model');

// Idempotent Lead -> Deal conversion. Safe to call repeatedly: returns the
// existing deal when one already references the lead (including races that
// lose a duplicate-key insert). On success the lead is stamped with dealId,
// which is what removes it from the active Leads query — a Converted lead
// WITHOUT dealId failed conversion and stays visible/retryable.
async function convertLeadToDeal(leadDoc) {
  if (!leadDoc || !leadDoc._id) {
    const error = new Error('Lead is required for conversion');
    error.status = 400;
    throw error;
  }
  const existing = await Deal.findOne({ sourceLeadId: leadDoc._id }).lean();
  if (existing) {
    await Lead.updateOne({ _id: leadDoc._id }, { $set: { dealId: existing._id } });
    return { deal: existing, created: false };
  }
  const lead = typeof leadDoc.toObject === 'function' ? leadDoc.toObject() : leadDoc;
  const payload = {
    sourceLeadId: lead._id,
    leadSnapshot: {
      title: lead.title || '',
      categoryName: lead.categoryName || '',
      address: lead.address || '',
      city: lead.city || '',
      website: lead.website || '',
      phone: lead.phone || '',
      phoneUnformatted: lead.phoneUnformatted || '',
      leadCreatedAt: lead.createdAt,
      leadUpdatedAt: lead.updatedAt,
    },
    status: 'Converted',
    // Prefill client workspace from known lead data; admin completes the rest.
    client: {
      name: lead.title || '',
      mobileNumber1: lead.phoneUnformatted || lead.phone || '',
      address: lead.address || '',
      city: lead.city || '',
    },
  };
  try {
    const created = await Deal.create(payload);
    await Lead.updateOne({ _id: lead._id }, { $set: { dealId: created._id } });
    return { deal: created.toObject(), created: true };
  } catch (error) {
    if (error && error.code === 11000) {
      const raced = await Deal.findOne({ sourceLeadId: lead._id }).lean();
      if (raced) {
        return { deal: raced, created: false };
      }
    }
    throw error;
  }
}

module.exports = { convertLeadToDeal };

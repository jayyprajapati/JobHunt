const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobhunt';

function connectMongo() {
  return mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  });
}

const recipientSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  company: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
});

const campaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    body_html: { type: String, required: true },
    sender_name: { type: String, default: '' },
    recipients: { type: [recipientSchema], default: [] },
    send_mode: { type: String, enum: ['single', 'individual'], required: true },
    scheduled_at: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'scheduled', 'sent'], default: 'draft' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

campaignSchema.index({ status: 1, scheduled_at: 1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = {
  connectMongo,
  Campaign,
};

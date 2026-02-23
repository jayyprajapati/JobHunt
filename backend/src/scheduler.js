const { Campaign, User } = require('./db');
const { sendCampaign } = require('./routes/campaigns');

function startScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();
      const dueCampaigns = await Campaign.find({ status: 'scheduled', scheduled_at: { $lte: now } })
        .sort({ scheduled_at: 1 })
        .limit(20);

      for (const campaign of dueCampaigns) {
        try {
          console.log('[scheduler] sending campaign', campaign._id.toString(), 'scheduled for', campaign.scheduled_at);
          const user = await User.findById(campaign.userId);
          if (!user) {
            console.warn('[scheduler] user missing for campaign', campaign._id.toString());
            continue;
          }
          await sendCampaign(campaign._id, user);
        } catch (err) {
          console.error('Failed to send scheduled campaign', campaign._id.toString(), err.message);
        }
      }
    } catch (err) {
      console.error('Scheduler tick failed', err.message);
    }
  }, 60 * 1000);
}

module.exports = { startScheduler };

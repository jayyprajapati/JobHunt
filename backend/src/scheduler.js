const db = require('./db');
const { sendCampaign } = require('./routes/campaigns');

function startScheduler() {
  setInterval(async () => {
    const nowIso = new Date().toISOString();
    const dueCampaigns = db
      .prepare(
        "SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC"
      )
      .all(nowIso);

    for (const campaign of dueCampaigns) {
      try {
        await sendCampaign(campaign.id);
      } catch (err) {
        console.error('Failed to send scheduled campaign', campaign.id, err.message);
      }
    }
  }, 60 * 1000);
}

module.exports = { startScheduler };

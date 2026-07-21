# Smart-Home Starter Tutorial

## Generate Locally

The owner asset source is expected at `/mnt/e/data/model/smart_home_90sqm`. Generate local-validation bytes below `/home/cc/tmp`:

```bash
node scripts/smart-home/generate.mjs \
  --source /mnt/e/data/model/smart_home_90sqm \
  --mode local-validation \
  --output /home/cc/tmp/web3d-smart-home-starter
ln -sfn /home/cc/tmp/web3d-smart-home-starter apps/studio/public/starter
pnpm dev
```

The generator audits the frozen registry, floorplan, manifests, QA verdicts, GLB hashes, sizes, triangle counts and explicit
semantic node-index map. It excludes the conflicting `smart_toilet` asset and writes no public bytes without a complete
redistribution authorization.

## First Open

Use a clean browser profile at `http://127.0.0.1:4173`. Studio downloads the descriptor and archive, verifies both, then
saves one normal IndexedDB project. Existing profiles open their latest project. **New Scene** still creates an empty
document.

The presentation scene is an editable two-bedroom home. Scene-tree groups organize living, dining, bedrooms, kitchen,
bathroom, entry and corridor content. The original full architectural shell remains available in the tree while the open
presentation shell keeps the default camera readable.

## Run State

Select **Run**. One online Mock source supplies independent generic channels:

- channel A: normal/ready lighting, media and cleaning devices;
- channel B: an application-level offline device;
- channel C: an alarm device.

Bindings point those values at exact hashed glTF nodes. RuleSets project ready, offline and alarm colors and create warning
or critical alarms. Returning to **Edit** clears transient values and alarms without changing the document revision.

## Edit And Export

Select an object in the tree or viewport, transform it, and use Undo/Redo to confirm command history. Visibility and lock
controls remain local document edits. Export JSON for the document contract or `.web3d.zip` for the complete scene and
content-addressed assets.

Do not publish the generated smart-home archive until its report records an authorized redistribution license for every
selected source hash.

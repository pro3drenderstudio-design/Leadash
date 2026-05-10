import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId:     process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export default mux;

/** Create a direct upload URL for admin video uploads */
export async function createMuxUpload() {
  const upload = await mux.video.uploads.create({
    cors_origin: process.env.NEXT_PUBLIC_SITE_URL ?? "*",
    new_asset_settings: {
      playback_policy: ["signed"],
      encoding_tier: "smart",
    },
  });
  return { uploadId: upload.id, url: upload.url };
}

/** Get asset status + playback ID after upload completes */
export async function getMuxAsset(assetId: string) {
  const asset = await mux.video.assets.retrieve(assetId);
  return {
    status:      asset.status,
    playbackId:  asset.playback_ids?.[0]?.id ?? null,
    durationSecs: asset.duration ? Math.round(asset.duration) : null,
  };
}

/** Generate a signed playback token (1-hour expiry) */
export async function getSignedPlaybackToken(
  playbackId: string,
  viewerId: string
): Promise<string> {
  const token = await mux.jwt.signPlaybackId(playbackId, {
    type:       "video",
    expiration: "1h",
    params: { sub: viewerId },
    keyId:      process.env.MUX_SIGNING_KEY_ID!,
    keySecret:  process.env.MUX_SIGNING_PRIVATE_KEY!,
  });
  return token;
}

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { aslVideoAssets } from "../../lib/assets";

interface Props {
  /** Optional ASL video path. When present (and bundled), a player is shown. */
  videoPath?: string | null;
}

/**
 * Renders a bundled ASL video by resolving its asl_video_path through the
 * generated static require() map (lib/assets.ts). Shows a looping, muted
 * player with a play/pause toggle and an "ASL" badge. Renders nothing when
 * no video is available for the sign.
 */
export default function SignVideo({ videoPath }: Props) {
  const asset = videoPath ? aslVideoAssets[videoPath] : undefined;
  if (!asset) {
    return null;
  }
  return <VideoPlayer source={asset} />;
}

function VideoPlayer({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    // ASL clips are silent demonstrations; keep the 2s loop quiet.
    p.muted = true;
  });

  // `playing` doesn't re-render on its own; track changes via the event.
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  return (
    <View style={styles.wrap}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      <Pressable
        style={styles.playButton}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause ASL video" : "Play ASL video"}
      >
        <Text style={styles.playIcon}>{isPlaying ? "❚❚" : "▶"}</Text>
      </Pressable>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>ASL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: 240,
  },
  playButton: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    color: "#fff",
    fontSize: 16,
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(26, 115, 232, 0.9)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});

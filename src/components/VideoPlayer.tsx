"use client";

import React, { useRef, useEffect, SyntheticEvent } from 'react';

interface VideoPlayerProps {
  src: string | undefined;
  isPlaying: boolean;
  currentTime: number; // in seconds
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate?: (time: number) => void;
  onLoadedData?: (event: SyntheticEvent<HTMLVideoElement, Event>) => void;
  onEnded?: () => void;
  className?: string;
  isMuted?: boolean; // Often useful for autoplay or testing
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  isPlaying,
  currentTime,
  onPlay,
  onPause,
  onSeek,
  onTimeUpdate,
  onLoadedData,
  onEnded,
  className,
  isMuted = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastServerUpdateTime = useRef<number>(0);
  const isSeekingInternally = useRef<boolean>(false); // To prevent onSeek loop during internal currentTime adjustments

  // Effect to control play/pause state
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(error => console.warn("Video play interrupted:", error));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, src]); // Re-run if src changes to ensure play state is correct for new video

  // Effect to control currentTime
  useEffect(() => {
    if (videoRef.current) {
      const videoElement = videoRef.current;
      // Only set currentTime if the difference is significant (e.g., > 1 second)
      // or if the video is paused (to allow precise seeking when paused)
      // and if not currently seeking due to user interaction on this client
      const timeDifference = Math.abs(videoElement.currentTime - currentTime);

      // Threshold for updating time, e.g. 1 second.
      // This helps avoid jerky playback when server updates are frequent.
      const UPDATE_THRESHOLD = 1;

      // Determine if an update is needed
      let needsUpdate = false;
      if (timeDifference > UPDATE_THRESHOLD) {
        needsUpdate = true;
      } else if (!isPlaying && videoElement.currentTime !== currentTime) {
        // If paused, allow more precise seeking even for small differences
        needsUpdate = true;
      }
      
      if (needsUpdate && !isSeekingInternally.current) {
        console.log(`VideoPlayer: Syncing currentTime. Current: ${videoElement.currentTime}, Target: ${currentTime}, Diff: ${timeDifference}, IsPlaying: ${isPlaying}`);
        isSeekingInternally.current = true; // Set flag before programmatically changing currentTime
        videoElement.currentTime = currentTime;
        lastServerUpdateTime.current = Date.now(); // Track when server state was last applied
      }
    }
  }, [currentTime, isPlaying]); // isPlaying is added to re-evaluate if we should force update time

  // Event Handlers
  const handlePlay = () => {
    console.log("VideoPlayer: handlePlay");
    onPlay();
  };

  const handlePause = () => {
    // Only call onPause if not caused by seeking or end of video
    if (videoRef.current && !videoRef.current.seeking && !videoRef.current.ended) {
      console.log("VideoPlayer: handlePause");
      onPause();
    }
  };

  const handleSeeked = () => {
    if (videoRef.current && isSeekingInternally.current) {
        isSeekingInternally.current = false; // Reset flag after seek operation completes
        return; // Don't call onSeek if this seek was triggered by currentTime prop change
    }
    if (videoRef.current) {
      console.log("VideoPlayer: handleSeeked to", videoRef.current.currentTime);
      onSeek(videoRef.current.currentTime);
    }
  };
  
  // Use onSeeking to set a flag that a seek is in progress.
  // Use onSeeked to actually call the onSeek prop.
  // This helps differentiate user-initiated seeks from programmatic seeks.
  const handleSeeking = () => {
    if (videoRef.current) {
        // If the seeking is happening very shortly after a server update,
        // it might be the video element adjusting to the new currentTime.
        // We want to capture user-initiated seeks.
        if (Date.now() - lastServerUpdateTime.current > 500) { // 500ms threshold
            console.log("VideoPlayer: handleSeeking (user initiated)", videoRef.current.currentTime);
            // onSeek(videoRef.current.currentTime); // Potentially call onSeek here or on 'seeked'
        }
    }
  };


  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  const handleLoadedData = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
    console.log("VideoPlayer: handleLoadedData");
    if (onLoadedData) {
      onLoadedData(event);
    }
    // When new video data is loaded, ensure its currentTime is set correctly
    // if there's an initial `currentTime` prop value.
    if (videoRef.current && currentTime !== undefined && videoRef.current.currentTime !== currentTime) {
        // Only if it's significantly different or if it's the very beginning
        if (Math.abs(videoRef.current.currentTime - currentTime) > 0.5 || currentTime === 0) {
            console.log(`VideoPlayer: Setting initial currentTime on loadeddata: ${currentTime}`);
            isSeekingInternally.current = true; // Prevent onSeek from firing for this initial set
            videoRef.current.currentTime = currentTime;
        }
    }
  };

  const handleEnded = () => {
    console.log("VideoPlayer: handleEnded");
    if (onEnded) {
      onEnded();
    }
  };

  return (
    <video
      ref={videoRef}
      src={src}
      onPlay={handlePlay}
      onPause={handlePause}
      onSeeking={handleSeeking} // Fired when a seek operation starts
      onSeeked={handleSeeked}   // Fired when a seek operation completes
      onTimeUpdate={handleTimeUpdate}
      onLoadedData={handleLoadedData}
      onEnded={handleEnded}
      className={className || "w-full h-auto"}
      controls // Standard browser controls
      muted={isMuted} // Mute for autoplay policies or testing
      // Consider adding playsInline for mobile devices
      playsInline 
    />
  );
};

export default VideoPlayer;

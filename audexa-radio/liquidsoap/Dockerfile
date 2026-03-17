FROM savonet/liquidsoap:v2.2.5

# Copy radio configuration
COPY radio.liq /etc/liquidsoap/radio.liq

# Create directories for audio sources
RUN mkdir -p /queue /music /jingles

# Generate a silent fallback file (10 seconds) in case music dir is empty
RUN apt-get update && apt-get install -y ffmpeg && \
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 10 -q:a 9 -acodec libmp3lame /music/silence.mp3 && \
    apt-get remove -y ffmpeg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

EXPOSE 1234

CMD ["liquidsoap", "/etc/liquidsoap/radio.liq"]

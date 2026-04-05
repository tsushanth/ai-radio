FROM savonet/liquidsoap:v2.2.5

# Copy radio configuration
COPY radio.liq /etc/liquidsoap/radio.liq

EXPOSE 1234

CMD ["liquidsoap", "/etc/liquidsoap/radio.liq"]

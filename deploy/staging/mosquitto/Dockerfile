# Mosquitto for isolated staging — config baked; password from ORBIT_MQTT_PASSWORD at start.
FROM eclipse-mosquitto:2
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY docker-entrypoint.sh /docker-entrypoint-staging.sh
USER root
RUN chmod +x /docker-entrypoint-staging.sh
ENTRYPOINT ["/docker-entrypoint-staging.sh"]

#!/bin/sh
set -e
PASS="${ORBIT_MQTT_PASSWORD:?ORBIT_MQTT_PASSWORD required}"
USER_NAME="${ORBIT_MQTT_USERNAME:-orbit-staging-consumer}"
# mosquitto_passwd -c creates file; -b batch mode
mosquitto_passwd -c -b /mosquitto/config/mosquitto.passwd "$USER_NAME" "$PASS"
chown mosquitto:mosquitto /mosquitto/config/mosquitto.passwd
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf

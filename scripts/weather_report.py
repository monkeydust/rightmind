#!/usr/bin/env python3
"""Daily weather report for Crete, delivered by email.

Fetches today's forecast for Heraklion, Crete from the Open-Meteo API
(free, no API key required) and emails a plain-text report.

Required environment variables for sending email:
  SMTP_USERNAME  - SMTP login (e.g. your.name@gmail.com)
  SMTP_PASSWORD  - SMTP password (for Gmail, use an App Password:
                   https://myaccount.google.com/apppasswords)
Optional:
  SMTP_HOST      - defaults to smtp.gmail.com
  SMTP_PORT      - defaults to 465 (SSL)
  WEATHER_TO     - recipient, defaults to jklondon@gmail.com

Run with --dry-run to print the report without sending anything.
"""

import json
import os
import smtplib
import ssl
import sys
import urllib.request
from datetime import date
from email.message import EmailMessage

LATITUDE = 35.34  # Heraklion, Crete
LONGITUDE = 25.13
TIMEZONE = "Europe/Athens"
DEFAULT_RECIPIENT = "jklondon@gmail.com"

WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def fetch_forecast():
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LATITUDE}&longitude={LONGITUDE}"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_probability_max,wind_speed_10m_max,uv_index_max,"
        "sunrise,sunset"
        "&current=temperature_2m,relative_humidity_2m,weather_code"
        f"&timezone={TIMEZONE}&forecast_days=1"
    )
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def build_report(data):
    daily = data["daily"]
    current = data["current"]
    condition = WEATHER_CODES.get(daily["weather_code"][0], "Unknown")
    now_condition = WEATHER_CODES.get(current["weather_code"], "Unknown")
    sunrise = daily["sunrise"][0].split("T")[1]
    sunset = daily["sunset"][0].split("T")[1]
    return "\n".join(
        [
            f"Weather report for Crete (Heraklion) - {date.today():%A %d %B %Y}",
            "",
            f"Right now:  {current['temperature_2m']}\N{DEGREE SIGN}C, "
            f"{now_condition}, humidity {current['relative_humidity_2m']}%",
            "",
            f"Today:      {condition}",
            f"High/Low:   {daily['temperature_2m_max'][0]}\N{DEGREE SIGN}C / "
            f"{daily['temperature_2m_min'][0]}\N{DEGREE SIGN}C",
            f"Rain risk:  {daily['precipitation_probability_max'][0]}%",
            f"Max wind:   {daily['wind_speed_10m_max'][0]} km/h",
            f"UV index:   {daily['uv_index_max'][0]}",
            f"Sunrise:    {sunrise}   Sunset: {sunset}",
            "",
            "Data from open-meteo.com",
        ]
    )


def send_email(report, recipient):
    username = os.environ["SMTP_USERNAME"]
    password = os.environ["SMTP_PASSWORD"]
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))

    msg = EmailMessage()
    msg["Subject"] = f"Crete weather - {date.today():%a %d %b}"
    msg["From"] = username
    msg["To"] = recipient
    msg.set_content(report)

    with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context()) as smtp:
        smtp.login(username, password)
        smtp.send_message(msg)


def main():
    dry_run = "--dry-run" in sys.argv
    report = build_report(fetch_forecast())
    print(report)
    if dry_run:
        print("[dry run - email not sent]", file=sys.stderr)
        return
    recipient = os.environ.get("WEATHER_TO", DEFAULT_RECIPIENT)
    send_email(report, recipient)
    print(f"\nEmail sent to {recipient}")


if __name__ == "__main__":
    main()

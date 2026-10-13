#!/bin/sh
# Removes the CourtOS app and its login item. Cases, work folders (~/CourtOS) and the
# settings (~/.config/courtos) stay. Run with sudo.
set -u
user=$(stat -f%Su /dev/console)
uid=$(id -u "$user")
launchctl bootout "gui/$uid" /Library/LaunchAgents/ch.courtos.local.plist 2>/dev/null
pkill -x CourtOS 2>/dev/null
rm -f /Library/LaunchAgents/ch.courtos.local.plist
rm -rf /Applications/CourtOS.app
pkgutil --forget ch.courtos.local >/dev/null 2>&1
echo "CourtOS entfernt. Ein Zertifikat „CourtOS localhost“ in der Schlüsselbundverwaltung können Sie dort löschen."

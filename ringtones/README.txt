Custom alarm ringtones
======================

Two ways to add your own alarm sound:

1) From your device (quickest)
   Open Lull → Alarm → "+ custom mp3…" and pick any audio file.
   It's stored on your device and stays in the list across reloads.

2) Bundle an mp3 with the app (shows for everyone)
   a. Drop your .mp3 file into this folder, e.g.  ringtones/my-song.mp3
   b. Add an entry to ringtones.json in this same folder:

      [
        { "name": "My Song", "file": "my-song.mp3" }
      ]

   "name" is what shows in the list; "file" is the filename here.
   Multiple tones:

      [
        { "name": "My Song",  "file": "my-song.mp3" },
        { "name": "Birdsong",  "file": "birds.mp3" }
      ]

The built-in tones (Chimes, Music box, Sunrise, Harp, Pulse) are
synthesized live and need no files.

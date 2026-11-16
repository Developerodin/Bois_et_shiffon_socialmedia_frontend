# Story frame fonts

The only fonts story frames are rendered with (server/stories/render.ts). `fonts.conf` points fontconfig at this
folder alone; each text layer also names its file by script, so rendering doesn't depend on the server's fonts.

All are licensed under the SIL Open Font License 1.1 (full text in OFL.txt).

| File | Source |
|---|---|
| Inter-Regular.ttf | `@expo-google-fonts/inter` 0.4.2, `400Regular/Inter_400Regular.ttf` (Copyright 2020 The Inter Project Authors, https://github.com/rsms/inter) |
| Inter-SemiBold.ttf | `@expo-google-fonts/inter` 0.4.2, `600SemiBold/Inter_600SemiBold.ttf` |
| NotoSans-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf (Copyright 2022 The Noto Project Authors, https://github.com/notofonts/latin-greek-cyrillic) |
| NotoSansArabic-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf (https://github.com/notofonts/arabic) |
| NotoSansDevanagari-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf (https://github.com/notofonts/devanagari) |
| NotoSansHebrew-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Regular.ttf (https://github.com/notofonts/hebrew) |

Changing a font changes rendered pixels: bump `RENDERER_VERSION` in render.ts so frames get new content keys.

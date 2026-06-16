# Patalympics online stellen

## 1. GitHub Pages

Dieses Projekt ist aktuell eine statische Website. Das passt gut zu GitHub Pages.

In GitHub:

1. Repository öffnen.
2. `Settings` öffnen.
3. `Pages` öffnen.
4. Bei `Build and deployment` den Branch auswählen, meistens `main`.
5. Als Ordner `/root` auswählen.
6. Speichern.

Danach bekommst du eine GitHub-Pages-URL.

## 2. Supabase vorbereiten

In Supabase:

1. Projekt öffnen.
2. `SQL Editor` öffnen.
3. Den Inhalt aus `supabase-schema.sql` einfügen.
4. Ausführen.

Dadurch entstehen Tabellen für:

- allgemeine Admin-Inhalte
- Verfügbarkeits-Antworten
- Game-Vorschläge
- Game-Votes

Für den aktuellen privaten Start dürfen die Admin-Inhalte über die Website geschrieben werden. Das ist praktisch, aber noch keine starke Admin-Sicherheit. Vor einer größeren öffentlichen Nutzung sollte das auf Supabase Auth oder Edge Functions umgestellt werden.

## 3. Supabase Zugangsdaten

Die Datei `supabase-config.example.js` kopieren und umbenennen zu:

```txt
supabase-config.js
```

Dann eintragen:

```js
window.PATALYMPICS_SUPABASE = {
  url: "https://DEIN-PROJECT.supabase.co",
  anonKey: "DEIN-ANON-PUBLIC-KEY"
};
```

Wichtig:

- `anon public key` oder `publishable key` ist okay für die Website.
- `service_role key` niemals in die Website eintragen.
- Wenn du den `publishable key` verwendest, darf `supabase-config.js` mit zu GitHub Pages.

## 4. Nächster Entwicklungsschritt

Aktuell speichert die Website noch lokal im Browser.

Als Nächstes muss `site.js` so umgebaut werden, dass es zuerst Supabase nutzt und nur als Fallback `localStorage`.

Danach funktionieren Polls, News, Kalender und Rangliste für alle Teilnehmer gemeinsam online.

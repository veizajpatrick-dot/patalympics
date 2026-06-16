# Patalympics online stellen

## 1. GitHub Pages

Dieses Projekt ist eine statische Website. Das passt gut zu GitHub Pages.

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

Wenn du die SQL-Datei später aktualisierst, kannst du sie einfach erneut ausführen.

Dadurch entstehen Tabellen für:

- allgemeine Admin-Inhalte
- Verfügbarkeits-Antworten
- Game-Vorschläge
- Game-Votes
- Admin-Freigaben

## 3. Admin anlegen

Für den Admin-Zugang brauchst du jetzt einen echten Supabase-User.

In Supabase:

1. `Authentication` öffnen.
2. Unter `Users` einen User mit E-Mail und Passwort anlegen.
3. Die `id` dieses Users kopieren.
4. Im `SQL Editor` diesen Befehl ausführen:

```sql
insert into public.admin_users (user_id, email)
values ('DEINE-USER-ID', 'deine-mail@example.com')
on conflict (user_id) do update
set email = excluded.email;
```

Danach kann sich genau dieser User über den Admin-Login auf der Website anmelden.

## 4. Supabase Zugangsdaten

Die Website ist bereits mit Supabase verbunden. Die Zugangsdaten stehen in:

```txt
supabase-config.js
```

Wichtig:

- `anon public key` oder `publishable key` ist okay für die Website.
- `service_role key` niemals in die Website eintragen.
- `supabase-config.js` muss mit zu GitHub Pages hochgeladen werden.

## 5. Speicherung

Die Website nutzt Supabase für gemeinsame Online-Daten.

Lokal im Browser werden nur zwei kleine Dinge gespeichert:

- der Admin-Login für die aktuelle Nutzung
- der Teilnehmername auf der Poll-Seite, damit er nicht bei jeder Abstimmung neu eingetragen werden muss

Online gespeichert werden:

- News
- Kalender
- Poll-Einstellungen
- Poll-Antworten
- Rangliste
- Ranglisten-Archiv

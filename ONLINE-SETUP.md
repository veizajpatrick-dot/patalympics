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

Für den Admin-Zugang brauchst du einen echten Supabase-User.
Auf der Website meldest du dich später aber nur mit `Admin-Name + Passwort` an.

In Supabase:

1. `Authentication` öffnen.
2. Einen einfachen Admin-Namen festlegen, zum Beispiel `pat`.
3. Unter `Users` einen User mit dieser internen E-Mail und einem Passwort anlegen:

```txt
pat@patalympics.admin
```

4. Die `id` dieses Users kopieren.
5. Im `SQL Editor` diesen Befehl ausführen:

```sql
insert into public.admin_users (user_id, email, login_name)
values ('DEINE-USER-ID', 'pat@patalympics.admin', 'pat')
on conflict (user_id) do update
set email = excluded.email,
    login_name = excluded.login_name;
```

Danach kannst du dich auf der Website einfach mit `pat` und deinem Passwort einloggen.

Wenn du einen echten Supabase-User mit normaler E-Mail nutzt, kannst du trotzdem einen kurzen Login-Namen setzen:

```sql
insert into public.admin_users (user_id, email, login_name)
values ('DEINE-USER-ID', 'deine-email@example.com', 'pat')
on conflict (user_id) do update
set email = excluded.email,
    login_name = excluded.login_name;
```

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

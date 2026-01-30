# Dokumentenpfad konfigurieren

DMSCode benötigt einen Ordner, in dem Ihre Dokumente gespeichert werden.

1. Öffnen Sie die Einstellungen (`Ctrl+,`).
2. Suchen Sie nach `dms.documentsPath`.
3. Geben Sie den absoluten Pfad zu Ihrem Dokumentenordner ein (z.B. `C:\Users\Name\Documents\DMS`).
4. Alternativ können Sie dieses Setting auch in Ihrer `settings.json` festlegen:

```json
"dms.documentsPath": "C:\\Users\\Name\\Documents\\DMS"
```

Sobald der Pfad gesetzt ist, überwacht DMSCode diesen Ordner automatisch auf neue Dateien.

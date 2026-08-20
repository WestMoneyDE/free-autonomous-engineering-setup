# Free Autonomous Engineering Setup

[English](README.md) · [Installation](docs/INSTALLATION.md) · [Architektur](docs/ARCHITECTURE.md) · [Routing](docs/ROUTING.md) · [Kosten](docs/COSTS.md)

Dieses Repository baut eine **lokale, free-preferred Coding-Control-Plane** aus vier klar getrennten Ebenen:

1. **DeepSeek Harness** führt den agentischen Coding-Loop aus.
2. **OmniRoute** entscheidet über Modell/Provider, Fallback, Kosten-, Quota-, Health- und Latenzsignale.
3. **Git + Repository-State** speichern Work Orders, Entscheidungen, Evidence und Session-Checkpoints dauerhaft.
4. **Human Authority** bleibt für externe, destruktive, Production-, Finanz-, Rechts- und andere schwer reversible Aktionen zuständig.

Die stärksten generalisierbaren Muster aus `WestMoneyDE/ai-engineering-stack` und `WestMoneyDE/LOGOS-1` werden hier als öffentlich wiederverwendbares Engineering-Setup zusammengeführt: evidence-driven Loop Engineering, unabhängiger Review, Fail-Closed-Verhalten, Memory-Provenance, Authority-Firewall, One-Shot-External-Execution und konsistente Repo-Checkpoints.

## Schnellstart

```bash
git clone https://github.com/WestMoneyDE/free-autonomous-engineering-setup.git
cd free-autonomous-engineering-setup
npm test
bash scripts/bootstrap.sh
```

OmniRoute starten:

```bash
npx omniroute
```

Endpoint:

```text
http://localhost:20128/v1
```

DeepSeek Harness in einem zweiten Terminal starten:

```bash
npx @deepseek-ai/dsh web
```

Web UI:

```text
http://127.0.0.1:3080
```

Danach in DSH unter **Settings → Models → Add a custom provider**:

```text
Provider ID: omniroute
Base URL:    http://127.0.0.1:20128/v1
Protocol:    openai-completions
API key:     dummy-key       (nur lokales Quickstart)
Model:       auto/coding
```

Alternativ die Vorlage [`config/dsh-omniroute.settings.example.yaml`](config/dsh-omniroute.settings.example.yaml) in die vorhandenen DSH-Settings **mergen**, nicht blind überschreiben.

## Empfohlene Routen

| Aufgabe | Route |
|---|---|
| Standard-Coding | `auto/coding` |
| Schnelle kleine Aufgaben | `auto/coding:fast` |
| Kostenoptimiert | `auto/coding:cheap` |
| Stabilität priorisieren | `auto/coding:reliable` |
| Kostenlos bevorzugen | `auto/coding:free` |
| Schwierige Architektur/Reasoning | `auto/reasoning:pro` |

**Wichtig:** `auto/coding:free` ist in OmniRoute kein mathematisch garantiertes 0-$-Budget. Die Category/Tier-Filter sind upstream fail-open, wenn kein Kandidat passt. Für ein hartes 0-$-System müssen ausschließlich erlaubte kostenlose Kandidaten verfügbar sein bzw. harte Budgetkontrollen benutzt werden, soweit der Client die entsprechenden OmniRoute-Header senden kann.

## Arbeitsregel

```text
Work Order → Plan → Build → Verify → Independent Review → Human Gate → Checkpoint
```

- Capability ist nicht Authority.
- Memory ist nicht Assurance State.
- Ein Agent darf seine eigenen Rechte nicht erweitern.
- Fehlende Evidence bleibt unbekannt.
- Provider-/Netzwerkfehler sind WAIT/FAIL, niemals Erfolg.
- Kein Abschluss ohne frische Tests/Checks.
- Kein automatisches Wiederholen fehlgeschlagener externer Ausführungen ohne neue explizite Anweisung und materiell geänderte Voraussetzung.
- Eine substantielle Session hinterlässt einen dauerhaften Checkpoint, sodass ein neuer Agent ohne alten Chat fortsetzen kann.

Siehe [`AGENTS.md`](AGENTS.md), [`docs/OPERATING-MODEL.md`](docs/OPERATING-MODEL.md) und [`docs/MEMORY-AND-STATE.md`](docs/MEMORY-AND-STATE.md).

## Statushinweis

DeepSeek Harness ist upstream ausdrücklich **Developer Preview** und kann Breaking Changes enthalten. Dieses Repository wurde gegen die öffentlich verfügbare Upstream-Dokumentation vom **20.08.2026** validiert. Vor Updates die Integration erneut prüfen.

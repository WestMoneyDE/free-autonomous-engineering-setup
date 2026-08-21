# Free Autonomous Engineering Setup

Verantwortet von **Ömer Coskun** — [LinkedIn](https://www.linkedin.com/in/oemer-coskun53). Lineage-Name: **Autonomous Engineering Reference V1** (die öffentliche Weiterentwicklung des AI Engineering Stack).

[English](README.md) · [Installation](docs/INSTALLATION.md) · [Architektur](docs/ARCHITECTURE.md) · [Routing](docs/ROUTING.md) · [Kosten](docs/COSTS.md)

Dieses Repository baut eine **lokale, free-preferred Coding-Control-Plane** aus fünf klar getrennten Ebenen:

1. **Hermes Supervisor Runtime** (in diesem Repository implementiert, `src/supervisor/`) besitzt State Machine, Work-Order-Dispatch, Leases/Duplikatschutz, Eskalation und Recovery.
2. **DeepSeek Harness** führt den agentischen Coding-Loop aus.
3. **OmniRoute** entscheidet über Modell/Provider, Fallback, Kosten-, Quota-, Health- und Latenzsignale.
4. **Git + Repository-State** speichern Work Orders, Entscheidungen, Evidence und Session-Checkpoints dauerhaft.
5. **Human Authority** bleibt für externe, destruktive, Production-, Finanz-, Rechts- und andere schwer reversible Aktionen zuständig.

**Status:** Die Control Plane ist ausführbar, nicht nur dokumentiert — State Machine, Memory Fabric mit Authority-Provenance, deterministischer Effect Gate, One-Shot-Approvals und Evidence Ledger sind implementiert und getestet. Der exakte Stand jeder Capability steht in [`CAPABILITIES.md`](CAPABILITIES.md) — keine Capability wird höher eingestuft, als ihre Tests belegen. Bedrohungsmodell: [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md).

Die stärksten generalisierbaren Muster aus `WestMoneyDE/ai-engineering-stack` und `WestMoneyDE/LOGOS-1` werden hier als öffentlich wiederverwendbares Engineering-Setup zusammengeführt: evidence-driven Loop Engineering, unabhängiger Review, Fail-Closed-Verhalten, Memory-Provenance, Authority-Firewall, One-Shot-External-Execution und konsistente Repo-Checkpoints.

## Schnellstart

```bash
git clone https://github.com/WestMoneyDE/free-autonomous-engineering-setup.git
cd free-autonomous-engineering-setup
npm test          # Invarianten-Testsuiten + Repository-Contract
npm run demo      # kompletter Loop PLANNED → … → DONE, lokal, ohne Modell
bash scripts/bootstrap.sh   # Dry-Run: prüft nur Voraussetzungen, schreibt nichts
```

OmniRoute starten:

```bash
npx omniroute@3.8.49
```

Endpoint:

```text
http://localhost:20128/v1
```

DeepSeek Harness in einem zweiten Terminal starten:

```bash
npx @deepseek-ai/dsh@0.1.0-rc.7 web
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
API key:     dummy-key       (nur lokales Quickstart — jeder nicht-leere
                             Wert wird akzeptiert, d. h. KEINE Authentifizierung;
                             Endpoint nur auf 127.0.0.1 binden)
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

## Memory Factory, Scope Engine und kanonische Agent-Flächen

Die **Memory Factory** (`src/memory/factory.mjs`) ist der einzige unterstützte Eingang in die Memory Fabric: Ingest, Retrieval, Konsolidierung und Projektion laufen durch sie, damit Source- **und** Authority-Provenance, Konflikte, Supersession und Revocation konstruktionsbedingt erhalten bleiben. Sie ist reine Proposal-Seite und kann niemals Grants, Credentials, Scopes oder Approval-Token erzeugen.

Die **Scope Engine** (`src/policy/scope-engine.mjs`) ist der typisierte, restriktive Vertrag darüber, *was* ein Worker berühren darf. Scopes schneiden sich und weiten sich nie, jeder Dispatch bindet den exakten kanonischen `scope_digest` vor jeder Lease-Mutation, und eine `ALLOW`/`NARROW`-Entscheidung ohne passenden Effective Contract fällt fail-closed aus.

`.agents/`, `.skills/`, `.commands/` und `.claude/` sind kanonische, scope-gegatete Flächen im Repository und werden von `scripts/init-project.mjs` byte-identisch mit SHA-256-`INSTALL-MANIFEST.json` installiert. `.claude/` bleibt ein dünner Adapter ohne eigene konsequente Autorität.

## Security Reviewer (Strix)

Der Security-Review folgt dem Verfahren aus [`usestrix/strix`](https://github.com/usestrix/strix), gepinnt auf Commit `2cc816781438f2993bcbb5c8cf3f693c25380142`, Lizenz `Apache-2.0`. Es wird kein Strix-Code vendored und kein Strix-Executable installiert.

Die Integration ist ein **autorisierungs-gegateter Vertrag, keine Automation**: Der Preflight liefert immer `execution_authorized: false`. Ein Lauf gegen ein Ziel erfordert exakte schriftliche Zielautorisierung (written target authorization), eine unabhängige AssuranceStore-Freigabe und ein Effect-Gate-ALLOW. In diesem Release findet **keine echte Strix-Ausführung** statt: `NOT_EXECUTED`.

Unbeaufsichtigter Dauerbetrieb (unattended continuous operation) bleibt `NOT_CLAIMED`, ebenso mobiler Approval-Transport.

## Kontakt

- LinkedIn: [Ömer Coskun](https://www.linkedin.com/in/oemer-coskun53)

## Statushinweis

DeepSeek Harness ist upstream ausdrücklich **Developer Preview** und kann Breaking Changes enthalten. Dieses Repository wurde gegen die öffentlich verfügbare Upstream-Dokumentation vom **20.08.2026** validiert. Vor Updates die Integration erneut prüfen.

"use client";

import { FormEvent, useMemo, useState } from "react";

type PatientRecord = {
  id: number;
  date: string;
  time: string;
  specialty: string;
  patient: string;
  evolution: string;
};

type DraftRecord = Omit<PatientRecord, "id">;

const fieldLabelMap: Record<keyof DraftRecord, string> = {
  date: "Data",
  time: "Horário",
  specialty: "Especialidade",
  patient: "Paciente",
  evolution: "Evolução",
};

const initialDraft: DraftRecord = {
  date: "",
  time: "",
  specialty: "",
  patient: "",
  evolution: "",
};

function formatDateBr(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "-";
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  return trimmed;
}

function getMissingFields(draft: DraftRecord): Array<keyof DraftRecord> {
  return (Object.keys(fieldLabelMap) as Array<keyof DraftRecord>).filter((field) => {
    return !draft[field]?.trim();
  });
}

function getValidationMessage(missingFields: Array<keyof DraftRecord>): string {
  const labels = missingFields.map((field) => fieldLabelMap[field]);
  return `Preencha todos os campos obrigatórios: ${labels.join(", ")}.`;
}

function getFallbackFileName(records: PatientRecord[]): string {
  const firstDate = records[0]?.date?.trim();
  const isoMatch = firstDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `Data-${day}-${month}-${year}.pdf`;
  }

  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  return `Data-${day}-${month}-${year}.pdf`;
}

function formatReport(records: PatientRecord[]): string {
  const lines: string[] = [];

  if (records.length === 0) {
    lines.push("Nenhum paciente cadastrado no momento.");
    return lines.join("\n");
  }

  records.forEach((record, index) => {
    lines.push(`Data: ${formatDateBr(record.date)}`);
    lines.push(`Horário: ${record.time || "-"}`);
    lines.push(`Especialidade: ${record.specialty || "-"}`);
    lines.push(`Paciente: ${record.patient || "-"}`);
    lines.push("Evolução:");
    lines.push(record.evolution || "-");

    if (index < records.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

export default function Home() {
  const [draft, setDraft] = useState<DraftRecord>(initialDraft);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [generatedReport, setGeneratedReport] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [missingFields, setMissingFields] = useState<Array<keyof DraftRecord>>([]);
  const [validationMessage, setValidationMessage] = useState("");

  const reportPreview = useMemo(() => formatReport(records), [records]);

  function updateDraft<K extends keyof DraftRecord>(
    field: K,
    value: DraftRecord[K],
  ) {
    setDraft((current) => {
      const updated = { ...current, [field]: value };
      const missing = getMissingFields(updated);
      setMissingFields(missing);
      setValidationMessage(missing.length > 0 ? getValidationMessage(missing) : "");
      return updated;
    });
  }

  function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const missing = getMissingFields(draft);
    if (missing.length > 0) {
      setMissingFields(missing);
      setValidationMessage(getValidationMessage(missing));
      return;
    }

    setRecords((current) => [
      ...current,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: draft.date,
        time: draft.time,
        specialty: draft.specialty.trim(),
        patient: draft.patient.trim(),
        evolution: draft.evolution.trim(),
      },
    ]);

    setDraft((current) => ({
      ...initialDraft,
      date: current.date,
    }));
    setMissingFields([]);
    setValidationMessage("");
  }

  function fieldInputClass(field: keyof DraftRecord): string {
    if (missingFields.includes(field)) {
      return "field-input border-rose-500 !bg-rose-50/60 focus-visible:!border-rose-600 focus-visible:!shadow-[0_0_0_4px_rgba(225,29,72,0.22)]";
    }

    return "field-input";
  }

  function fieldError(field: keyof DraftRecord): string {
    if (!missingFields.includes(field)) {
      return "";
    }

    return `${fieldLabelMap[field]} é obrigatório.`;
  }

  function moveRecord(index: number, direction: "up" | "down") {
    setRecords((current) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) {
        return current;
      }

      const updated = [...current];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });
  }

  function deleteRecord(id: number) {
    setRecords((current) => current.filter((record) => record.id !== id));
  }

  function generateReport() {
    setGeneratedReport(reportPreview);
  }

  async function downloadReport() {
    if (records.length === 0) {
      window.alert("Cadastre ao menos um paciente antes de baixar o relatorio.");
      return;
    }

    setIsDownloading(true);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patients: records.map((record) => ({
            date: record.date,
            time: record.time,
            specialty: record.specialty,
            patient: record.patient,
            evolution: record.evolution,
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        window.alert(payload?.error || "Falha ao gerar o relatorio no servidor.");
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] || getFallbackFileName(records);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.alert("Erro de conexao ao gerar o relatorio.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="journal-root min-h-dvh px-4 py-8 sm:px-8 lg:px-12">
      <div className="journal-noise" aria-hidden />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="journal-hero rounded-4xl p-6 sm:p-8">
          <p className="journal-chip">Psicologia Clinica</p>
          <h1 className="mt-3 text-balance text-3xl leading-tight font-title text-slate-900 sm:text-5xl">
            Painel de Relatorio de Pacientes
          </h1>
         
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.08fr_1fr]">
          <section className="journal-card rounded-4xl p-5 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-title text-slate-900">Novo atendimento</h2>
              <span className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Campos do prontuario
              </span>
            </div>

            {validationMessage ? (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
              >
                {validationMessage}
              </div>
            ) : null}

            <form onSubmit={addRecord} noValidate className="grid gap-4 sm:grid-cols-2">
              <label className="field-shell">
                <span className="field-label">Data</span>
                <input
                  className={fieldInputClass("date")}
                  type="date"
                  value={draft.date}
                  onChange={(event) => updateDraft("date", event.target.value)}
                  aria-invalid={missingFields.includes("date")}
                />
                {fieldError("date") ? (
                  <span className="text-xs font-semibold text-rose-700">{fieldError("date")}</span>
                ) : null}
              </label>

              <label className="field-shell">
                <span className="field-label">Horario</span>
                <input
                  className={fieldInputClass("time")}
                  type="time"
                  value={draft.time}
                  onChange={(event) => updateDraft("time", event.target.value)}
                  aria-invalid={missingFields.includes("time")}
                />
                {fieldError("time") ? (
                  <span className="text-xs font-semibold text-rose-700">{fieldError("time")}</span>
                ) : null}
              </label>

              <label className="field-shell sm:col-span-2">
                <span className="field-label">Especialidade</span>
                <input
                  className={fieldInputClass("specialty")}
                  type="text"
                  placeholder="Ex: Psicopedagogia"
                  value={draft.specialty}
                  onChange={(event) => updateDraft("specialty", event.target.value)}
                  aria-invalid={missingFields.includes("specialty")}
                />
                {fieldError("specialty") ? (
                  <span className="text-xs font-semibold text-rose-700">{fieldError("specialty")}</span>
                ) : null}
              </label>

              <label className="field-shell sm:col-span-2">
                <span className="field-label">Paciente</span>
                <input
                  className={fieldInputClass("patient")}
                  type="text"
                  placeholder="Nome completo"
                  value={draft.patient}
                  onChange={(event) => updateDraft("patient", event.target.value)}
                  aria-invalid={missingFields.includes("patient")}
                />
                {fieldError("patient") ? (
                  <span className="text-xs font-semibold text-rose-700">{fieldError("patient")}</span>
                ) : null}
              </label>

              <label className="field-shell sm:col-span-2">
                <span className="field-label">Evolucao</span>
                <textarea
                  className={`${fieldInputClass("evolution")} field-area`}
                  rows={5}
                  placeholder="Resumo da sessao, comportamento, avanços e conduta"
                  value={draft.evolution}
                  onChange={(event) => updateDraft("evolution", event.target.value)}
                  aria-invalid={missingFields.includes("evolution")}
                />
                {fieldError("evolution") ? (
                  <span className="text-xs font-semibold text-rose-700">{fieldError("evolution")}</span>
                ) : null}
              </label>

              <div className="sm:col-span-2 mt-1 flex flex-wrap gap-3">
                <button type="submit" className="btn-strong">
                  Cadastrar paciente
                </button>
                <span className="self-center text-xs text-slate-500">
                  Paciente e evolucao sao obrigatorios.
                </span>
              </div>
            </form>
          </section>

          <section className="journal-card rounded-4xl p-5 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-title text-slate-900">Lista do dia</h2>
                <p className="text-sm text-slate-600">
                  Ordem de geracao do documento
                </p>
              </div>
              <span className="count-badge">{records.length} pacientes</span>
            </div>

            {records.length === 0 ? (
              <div className="empty-list rounded-3xl p-6 text-sm text-slate-600">
                Nenhum paciente cadastrado ainda. Preencha o formulario para montar
                a fila ordenada.
              </div>
            ) : (
              <ol className="patient-queue">
                {records.map((record, index) => (
                  <li key={record.id} className="queue-item">
                    <div className="queue-index">{index + 1}</div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {record.patient}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {record.date ? formatDateBr(record.date) : "Sem data"} | {record.time || "Sem horario"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {record.specialty || "Especialidade nao informada"}
                      </p>
                    </div>

                    <div className="queue-actions">
                      <button
                        type="button"
                        className="btn-order"
                        onClick={() => moveRecord(index, "up")}
                        disabled={index === 0}
                        aria-label={`Mover ${record.patient} para cima`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-order"
                        onClick={() => moveRecord(index, "down")}
                        disabled={index === records.length - 1}
                        aria-label={`Mover ${record.patient} para baixo`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => deleteRecord(record.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-strong" onClick={generateReport}>
                Gerar relatorio
              </button>
              <button
                type="button"
                className="btn-soft"
                onClick={downloadReport}
                disabled={isDownloading}
              >
                {isDownloading ? "Gerando..." : "Baixar .pdf"}
              </button>
            </div>
          </section>
        </div>

        <section className="journal-card rounded-4xl p-5 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-title text-slate-900">Preview do relatorio</h2>
            <p className="text-xs font-medium tracking-[0.1em] text-slate-500 uppercase">
              Texto final para docs
            </p>
          </div>

          <pre className="preview-box">
            {generatedReport || "Clique em Gerar relatorio para visualizar o documento."}
          </pre>
        </section>
      </div>
    </main>
  );
}

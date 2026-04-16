import { PDFDocument, StandardFonts } from "pdf-lib";
import { NextResponse } from "next/server";

type PatientInput = {
  date?: string;
  time?: string;
  specialty?: string;
  patient?: string;
  evolution?: string;
};

type RequestBody = {
  patients?: PatientInput[];
};

function parseDate(value?: string): { day: string; month: string; year: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return { day, month, year };
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return { day, month, year };
  }

  return null;
}

function formatDateBr(value?: string): string {
  const parsed = parseDate(value);
  if (parsed) {
    return `${parsed.day}/${parsed.month}/${parsed.year}`;
  }

  return value?.trim() || "-";
}

function getFileDatePart(firstDate?: string): string {
  const parsed = parseDate(firstDate);
  if (parsed) {
    return `${parsed.day}-${parsed.month}-${parsed.year}`;
  }

  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  return `${day}-${month}-${year}`;
}

function wrapText(text: string, maxWidth: number, measure: (input: string) => number): string[] {
  const result: string[] = [];
  const paragraphs = text.split("\n");

  paragraphs.forEach((paragraph) => {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      result.push("");
      return;
    }

    const words = trimmedParagraph.split(/\s+/);
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        return;
      }

      if (line) {
        result.push(line);
      }
      line = word;
    });

    if (line) {
      result.push(line);
    }
  });

  return result.length > 0 ? result : ["-"];
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const patients = Array.isArray(body.patients) ? body.patients : [];

  if (patients.length === 0) {
    return NextResponse.json(
      { error: "Envie ao menos um paciente para gerar o relatorio." },
      { status: 400 },
    );
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 11;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 16;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawLine = (text: string) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(text, {
      x: margin,
      y,
      font,
      size: fontSize,
    });
    y -= lineHeight;
  };

  const drawLabelValue = (label: string, value: string) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    const labelText = `${label}: `;
    page.drawText(labelText, {
      x: margin,
      y,
      font: boldFont,
      size: fontSize,
    });

    const labelWidth = boldFont.widthOfTextAtSize(labelText, fontSize);
    page.drawText(value || "-", {
      x: margin + labelWidth,
      y,
      font,
      size: fontSize,
    });

    y -= lineHeight;
  };

  const drawLabelOnly = (label: string) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(`${label}:`, {
      x: margin,
      y,
      font: boldFont,
      size: fontSize,
    });
    y -= lineHeight;
  };

  patients.forEach((patient, index) => {
    drawLabelValue("Data", formatDateBr(patient.date));
    drawLabelValue("Horário", patient.time?.trim() || "-");
    drawLabelValue("Especialidade", patient.specialty?.trim() || "-");
    drawLabelValue("Paciente", patient.patient?.trim() || "-");
    drawLabelOnly("Evolução");

    const evolutionLines = wrapText(patient.evolution?.trim() || "-", contentWidth, (input) =>
      font.widthOfTextAtSize(input, fontSize),
    );
    evolutionLines.forEach((line) => drawLine(line || " "));

    if (index < patients.length - 1) {
      drawLine(" ");
    }
  });

  const fileBytes = await pdf.save();
  const datePart = getFileDatePart(patients[0]?.date);

  return new NextResponse(new Uint8Array(fileBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Data-${datePart}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

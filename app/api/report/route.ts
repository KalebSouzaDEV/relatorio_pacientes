import { PDFDocument, StandardFonts } from "pdf-lib";
import { NextResponse } from "next/server";

type RequestBody = {
  text?: string;
  filename?: string;
};

// Labels que queremos colocar em negrito
const labelsToBold = [
  "Data",
  "Horário",
  "Especialidade",
  "Paciente",
  "Evolução",
];

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

  const text = body.text || "";

  if (!text.trim()) {
    return NextResponse.json(
      { error: "Envie texto preenchido para gerar o relatorio." },
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

  const drawLine = (textLine: string, fontToUse = font) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(textLine, {
      x: margin,
      y,
      font: fontToUse,
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
    
    if (value) {
      const valueLines = wrapText(value, contentWidth - labelWidth, (input) =>
        font.widthOfTextAtSize(input, fontSize),
      );
      
      page.drawText(valueLines[0] || "", {
        x: margin + labelWidth,
        y,
        font,
        size: fontSize,
      });
      y -= lineHeight;

      for (let i = 1; i < valueLines.length; i++) {
        if (valueLines[i]) drawLine(valueLines[i]);
      }
    } else {
      y -= lineHeight;
    }
  };

  const lines = text.split('\n');

  lines.forEach(line => {
    const rawLine = line.replace('\r', '');
    let matchedLabel = false;

    for (const label of labelsToBold) {
      if (rawLine.startsWith(`${label}:`)) {
        const valuePart = rawLine.substring(label.length + 1).trim();
        if (valuePart.length > 0) {
            drawLabelValue(label, valuePart);
        } else {
            drawLine(`${label}:`, boldFont);
        }
        matchedLabel = true;
        break;
      }
    }

    if (!matchedLabel) {
      const wrapped = wrapText(rawLine, contentWidth, (input) =>
        font.widthOfTextAtSize(input, fontSize),
      );
      wrapped.forEach(w => {
         if (w) drawLine(w);
         else y -= lineHeight; // Preserva espaços em branco
      });
    }
  });

  const fileBytes = await pdf.save();
  const filename = body.filename || `Relatorio-${Date.now()}.pdf`;

  return new NextResponse(new Uint8Array(fileBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
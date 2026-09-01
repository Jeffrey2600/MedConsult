import PDFDocument from 'pdfkit';

const BRAND = '#0d9488';
const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e2e8f0';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

/**
 * Renders a prescription to a PDF buffer.
 *
 * Generated server-side rather than in the browser so the stored file is a
 * fixed artefact: what the patient downloads next year is byte-for-byte what
 * the doctor issued, not a re-render that could drift as the UI changes.
 */
export function renderPrescriptionPdf({
  prescription,
  doctor,
  doctorProfile,
  patient,
  patientProfile,
  appointment,
  // Tests render uncompressed so the drawn text can be read back out of the
  // file and asserted on. Production output stays compressed.
  compress = true,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width } = doc.page;
    const left = 50;
    const right = width - 50;
    const usable = right - left;

    // ---- header ----------------------------------------------------------
    doc.rect(0, 0, width, 90).fill(BRAND);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('MedConsult', left, 30);
    doc.fontSize(9).font('Helvetica').text('Online Multi-Doctor Consultation', left, 58);

    doc
      .fontSize(9)
      .text(`Issued ${formatDate(prescription.issuedAt ?? new Date())}`, left, 30, {
        width: usable,
        align: 'right',
      })
      .text(`Ref ${String(prescription._id ?? '').slice(-8).toUpperCase()}`, left, 44, {
        width: usable,
        align: 'right',
      });

    doc.fillColor(INK);
    let y = 115;

    // ---- doctor and patient ---------------------------------------------
    const colWidth = usable / 2 - 10;

    doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold').text('PRESCRIBED BY', left, y);
    doc.fontSize(8).text('PATIENT', left + colWidth + 20, y);

    y += 14;
    doc.fontSize(11).fillColor(INK).font('Helvetica-Bold').text(doctor?.name ?? '—', left, y, { width: colWidth });
    doc.text(patient?.name ?? '—', left + colWidth + 20, y, { width: colWidth });

    y += 16;
    doc.fontSize(9).font('Helvetica').fillColor(MUTED);
    doc.text(doctorProfile?.specialty?.name ?? '', left, y, { width: colWidth });

    const patientBits = [
      patientProfile?.age ? `${patientProfile.age} years` : null,
      patientProfile?.gender || null,
      patientProfile?.bloodGroup ? `Blood group ${patientProfile.bloodGroup}` : null,
    ].filter(Boolean);
    doc.text(patientBits.join(' · '), left + colWidth + 20, y, { width: colWidth });

    y += 13;
    if (doctorProfile?.qualifications?.length) {
      doc.text(doctorProfile.qualifications.join(', '), left, y, { width: colWidth });
    }
    if (appointment?.startsAt) {
      doc.text(`Consulted ${formatDate(appointment.startsAt)}`, left + colWidth + 20, y, {
        width: colWidth,
      });
    }

    y += 13;
    if (doctorProfile?.registrationNumber) {
      doc.text(`Reg. no. ${doctorProfile.registrationNumber}`, left, y, { width: colWidth });
    }

    y += 24;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).stroke();
    y += 20;

    // Allergies are the one thing a dispensing pharmacist must not miss.
    if (patientProfile?.allergies?.length) {
      doc.rect(left, y, usable, 26).fill('#fef2f2');
      doc.fillColor('#b91c1c').fontSize(9).font('Helvetica-Bold')
        .text(`ALLERGIES: ${patientProfile.allergies.join(', ')}`, left + 10, y + 9, {
          width: usable - 20,
        });
      y += 40;
      doc.fillColor(INK);
    }

    const section = (title) => {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold').text(title.toUpperCase(), left, y);
      y += 14;
      doc.fillColor(INK).font('Helvetica').fontSize(10);
    };

    // ---- diagnosis -------------------------------------------------------
    if (prescription.diagnosis) {
      section('Diagnosis');
      doc.text(prescription.diagnosis, left, y, { width: usable });
      y = doc.y + 18;
    }

    // ---- medicines -------------------------------------------------------
    if (prescription.medicines?.length) {
      section('Medication');

      prescription.medicines.forEach((med, index) => {
        // Start a new page rather than letting an entry run off the bottom.
        if (y > doc.page.height - 140) {
          doc.addPage();
          y = 60;
        }

        doc.fontSize(10).font('Helvetica-Bold').fillColor(INK)
          .text(`${index + 1}. ${med.name}`, left, y, { width: usable });
        y = doc.y + 3;

        const detail = [
          med.dosage && `Dose: ${med.dosage}`,
          med.frequency && `Frequency: ${med.frequency}`,
          med.duration && `Duration: ${med.duration}`,
        ].filter(Boolean).join('   ·   ');

        if (detail) {
          doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(detail, left + 14, y, { width: usable - 14 });
          y = doc.y + 2;
        }
        if (med.notes) {
          doc.fontSize(9).fillColor(MUTED).text(med.notes, left + 14, y, { width: usable - 14 });
          y = doc.y + 2;
        }
        y += 8;
      });
      y += 8;
    }

    // ---- tests -----------------------------------------------------------
    if (prescription.tests?.length) {
      if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
      section('Tests advised');
      prescription.tests.forEach((test) => {
        doc.fontSize(10).text(`•  ${test}`, left, y, { width: usable });
        y = doc.y + 4;
      });
      y += 14;
    }

    // ---- advice ----------------------------------------------------------
    if (prescription.advice) {
      if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
      section('Advice');
      doc.fontSize(10).text(prescription.advice, left, y, { width: usable });
      y = doc.y + 18;
    }

    if (prescription.followUpDate) {
      if (y > doc.page.height - 140) { doc.addPage(); y = 60; }
      section('Follow-up');
      doc.fontSize(10).text(formatDate(prescription.followUpDate), left, y, { width: usable });
      y = doc.y + 18;
    }

    // ---- footer ----------------------------------------------------------
    // Placed far enough above the bottom margin that the three-line
    // disclaimer fits. Sitting any lower makes PDFKit spill it onto a second,
    // otherwise-empty page.
    const FOOTER_HEIGHT = 120;
    const footerY = doc.page.height - FOOTER_HEIGHT;

    // If the body already reaches the footer, give the footer its own page
    // rather than printing it on top of the prescription.
    if (doc.y > footerY - 16) {
      doc.addPage();
    }

    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(RULE).stroke();

    doc.fontSize(9).fillColor(MUTED).font('Helvetica')
      .text(`Digitally issued by ${doctor?.name ?? ''} via MedConsult.`, left, footerY + 12, {
        width: usable,
        lineBreak: false,
      });

    // Stated on the document itself, not only in the project report — this
    // is a demonstration artefact and must never be mistaken for a valid
    // e-prescription.
    doc.fontSize(7.5).fillColor('#94a3b8')
      .text(
        'This prescription was produced by an academic demonstration system. It carries no digital signature, '
        + 'is not registered with any medical authority, and is not a legally valid e-prescription. '
        + 'Do not use it to dispense medication.',
        left,
        footerY + 32,
        // An explicit height keeps the paragraph inside the footer box
        // instead of triggering an automatic page break.
        { width: usable, height: 46, align: 'left' }
      );

    doc.end();
  });
}

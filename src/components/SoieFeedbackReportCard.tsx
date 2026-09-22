import React from 'react';

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  url?: string;
}

export interface SoieFeedbackReportCardProps {
  submissionData: any;
  assignmentData: any;
  round: string | number;
  sampleColor: string;
  sampleGivenFitDate: string;
  sampleReceivedDate: string;
  commentsDate: string;
  fitBeforeWash: string;
  fitAfterWash: string;
  commentsFabricTrims: string;
  attachments?: AttachmentItem[];
  id?: string;
}

export const getRoundOrdinal = (r: string | number): string => {
  const num = parseInt(String(r), 10) || 1;
  if (num === 1) return '1ST';
  if (num === 2) return '2ND';
  if (num === 3) return '3RD';
  if (num === 4) return '4TH';
  if (num === 5) return '5TH';
  return `${num}TH`;
};

export const getRoundName = (r: string | number): string => {
  const num = parseInt(String(r), 10) || 1;
  if (num === 1) return '1st Round';
  if (num === 2) return '2nd Round';
  if (num === 3) return '3rd Round';
  if (num === 4) return '4th Round';
  if (num === 5) return '5th Round';
  return `Round ${num}`;
};

export const formatDisplayDate = (d: string): string => {
  if (!d || d === '-' || d.trim() === '') return '-';
  const clean = d.trim();
  
  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const monthIdx = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const rawY = ddmmyyyyMatch[3];
    const year = rawY.length === 2 ? '20' + rawY : rawY;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (months[monthIdx]) {
      return `${String(day).padStart(2, '0')}-${months[monthIdx]}-${year}`;
    }
  }

  // YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const monthIdx = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (months[monthIdx]) {
      return `${String(day).padStart(2, '0')}-${months[monthIdx]}-${year}`;
    }
  }

  return clean;
};

export function SoieFeedbackReportCard({
  submissionData,
  assignmentData,
  round,
  sampleColor,
  sampleGivenFitDate,
  sampleReceivedDate,
  commentsDate,
  fitBeforeWash,
  fitAfterWash,
  commentsFabricTrims,
  attachments = [],
  id = 'soie-feedback-report-card'
}: SoieFeedbackReportCardProps) {
  const roundOrdinal = getRoundOrdinal(round);
  const roundName = getRoundName(round);

  const modelName = assignmentData?.model_name || assignmentData?.modelName || 'Model';
  const sampleType = submissionData?.type_of_sample || submissionData?.sampleType || '1st Fit Sample';
  const styleNo = submissionData?.style_number || submissionData?.styleNo || '-';
  const description = submissionData?.description || '-';
  const size = assignmentData?.size || '-';
  const color = sampleColor || assignmentData?.color || '-';

  return (
    <div 
      id={id}
      className="w-full max-w-[680px] mx-auto bg-white rounded-xl overflow-hidden shadow-lg border border-[#EAD8D0] text-[#3F1A28] font-sans print:shadow-none print:border print:border-[#EAD8D0] print:rounded-none"
      style={{ fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" }}
    >
      {/* Header Banner Image */}
      <div className="w-full bg-[#FBF2EC] text-center overflow-hidden leading-none border-b border-[#F2E4DE]">
        <img 
          src="https://i.ibb.co/4nRrhV9H/Chat-GPT-Image-May-15-2026-11-46-42-AM.png"
          alt="SOIE Lingerie Survey Form Banner"
          className="w-full max-w-[680px] h-auto mx-auto block"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Top Section: Audit Title & Model Header */}
      <div className="p-6 md:p-8 bg-gradient-to-b from-[#FFF8F5] to-white border-b border-[#F2E4DE]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-[#8F435A] uppercase mb-1">
              SOIE FIT AUDIT • {roundOrdinal} ROUND EVALUATION
            </div>
            <h1 className="text-2xl font-bold text-[#3F1A28] leading-tight">
              Quality Feedback Update
            </h1>
          </div>
          <div className="self-start sm:self-center">
            <span className="inline-block px-3.5 py-1.5 bg-[#FDEFF2] text-[#8F435A] font-bold text-sm rounded-full border border-[#F5CCD6] shadow-sm">
              {modelName}
            </span>
          </div>
        </div>

        {/* Detail Box: Model Name & Type of Sample */}
        <div className="mt-4 bg-[#FAF2EE] border border-[#E8D3C8] rounded-lg p-3.5 px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-[#634651]">Model Name: </span>
              <strong className="text-[#8F435A] font-semibold ml-1">{modelName}</strong>
            </div>
            <div>
              <span className="text-[#634651]">Type of Sample: </span>
              <strong className="text-[#3F1A28] font-semibold ml-1">{sampleType}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Table: Sample Specifications */}
      <div className="p-6 md:p-8 pb-3">
        <h2 className="text-xs font-bold text-[#3F1A28] uppercase tracking-wider mb-2.5">
          Sample Specifications
        </h2>
        <div className="overflow-x-auto border border-[#E2CEC3] rounded-md">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#8F435A] text-white">
                <th className="py-2.5 px-3 font-semibold border-r border-[#A2566D] whitespace-nowrap">Style no</th>
                <th className="py-2.5 px-3 font-semibold border-r border-[#A2566D]">Description</th>
                <th className="py-2.5 px-3 font-semibold border-r border-[#A2566D] text-center whitespace-nowrap">Size</th>
                <th className="py-2.5 px-3 font-semibold border-r border-[#A2566D] whitespace-nowrap">Sample color</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Sample given for Fit date</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white text-[#3F1A28]">
                <td className="py-3 px-3 font-bold text-[#8F435A] border-t border-r border-[#E8D8D0] align-top whitespace-nowrap">
                  {styleNo}
                </td>
                <td className="py-3 px-3 leading-relaxed border-t border-r border-[#E8D8D0] align-top min-w-[160px]">
                  {description}
                </td>
                <td className="py-3 px-3 text-center font-semibold border-t border-r border-[#E8D8D0] align-top whitespace-nowrap">
                  {size}
                </td>
                <td className="py-3 px-3 border-t border-r border-[#E8D8D0] align-top whitespace-nowrap">
                  {color}
                </td>
                <td className="py-3 px-3 border-t border-[#E8D8D0] align-top whitespace-nowrap font-medium text-slate-800">
                  {sampleGivenFitDate || '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Vertical Table: Round Specific Feedback */}
      <div className="p-6 md:p-8 pt-3 pb-6">
        <h2 className="text-xs font-bold text-[#3F1A28] uppercase tracking-wider mb-2.5">
          {roundName} Fit &amp; Wash Evaluation
        </h2>
        <div className="border border-[#E2CEC3] rounded-md overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <tbody>
              <tr className="bg-[#FAF3EF] border-b border-[#E8D8D0]">
                <td className="w-[38%] py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0]">
                  Sample received date
                </td>
                <td className="w-[62%] py-2.5 px-3.5 font-semibold text-[#4A2C37]">
                  {sampleReceivedDate || '-'}
                </td>
              </tr>
              <tr className="bg-white border-b border-[#E8D8D0]">
                <td className="py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0]">
                  Comments Date
                </td>
                <td className="py-2.5 px-3.5 font-semibold text-[#4A2C37]">
                  {commentsDate || '-'}
                </td>
              </tr>
              <tr className="bg-[#FAF3EF] border-b border-[#E8D8D0]">
                <td className="py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0] align-top">
                  Fit comments before wash
                </td>
                <td className="py-2.5 px-3.5 text-[#332228] leading-relaxed align-top">
                  {fitBeforeWash || 'No remarks noted'}
                </td>
              </tr>
              <tr className="bg-white border-b border-[#E8D8D0]">
                <td className="py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0] align-top">
                  Fit comments after wash
                </td>
                <td className="py-2.5 px-3.5 text-[#332228] leading-relaxed align-top">
                  {fitAfterWash || 'No remarks noted'}
                </td>
              </tr>
              <tr className="bg-[#FAF3EF] border-b border-[#E8D8D0]">
                <td className="py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0] align-top">
                  Comments on fabric / trims
                </td>
                <td className="py-2.5 px-3.5 text-[#332228] leading-relaxed align-top">
                  {commentsFabricTrims || 'No remarks noted'}
                </td>
              </tr>

              {/* Attachments Row (if any) */}
              {attachments && attachments.length > 0 && (
                <tr className="bg-white">
                  <td className="py-2.5 px-3.5 font-bold text-[#3F1A28] border-r border-[#E8D8D0] align-top">
                    Fit Photos &amp; Attachments ({attachments.length})
                  </td>
                  <td className="py-2.5 px-3.5 text-[#332228] align-top">
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div key={att.id || idx} className="border border-slate-200 rounded p-1 bg-slate-50 text-[11px] flex items-center gap-1.5">
                          {att.dataUrl && att.type.startsWith('image/') ? (
                            <img src={att.dataUrl} alt={att.name} className="w-8 h-8 object-cover rounded" />
                          ) : null}
                          <span className="truncate max-w-[140px] font-medium text-slate-700">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Body Appreciation & Closing Message */}
      <div className="p-6 md:p-8 bg-[#FFF9F6] border-t border-[#F0DFD7]">
        <div className="bg-white border-l-4 border-[#8F435A] p-4 rounded-r-lg shadow-sm">
          <p className="m-0 text-sm italic text-[#3E202C] leading-relaxed">
            &ldquo;Thanks for your feedback. Your valuable feedback is essential for our continuous improvement and service excellence.&rdquo;
          </p>
        </div>

        {/* Sign-off */}
        <div className="mt-5 text-xs text-[#553844] leading-relaxed">
          Warm regards,<br />
          <strong className="text-[#3F1A28] text-sm font-bold">Deepika</strong><br />
          <span>Lead Designer &amp; Quality Audit Team</span><br />
          <span className="text-[#8F435A] font-semibold">SOIE &bull; Ginza Industries Limited</span><br />
          <a href="mailto:designer02@soie.in" className="text-[#8F435A] hover:underline">designer02@soie.in</a>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="py-3 px-6 bg-[#381523] text-[#D8BAC5] text-[11px] text-center leading-normal">
        This is an automated quality feedback notification from SOIE Design Studio &bull; Ginza Industries Ltd.
      </div>
    </div>
  );
}

/**
 * Builds a standalone downloadable HTML document for the model
 */
export function generateSoieReportHtml(props: SoieFeedbackReportCardProps): string {
  const roundOrdinal = getRoundOrdinal(props.round);
  const roundName = getRoundName(props.round);
  const modelName = props.assignmentData?.model_name || props.assignmentData?.modelName || 'Model';
  const sampleType = props.submissionData?.type_of_sample || props.submissionData?.sampleType || '1st Fit Sample';
  const styleNo = props.submissionData?.style_number || props.submissionData?.styleNo || '-';
  const description = props.submissionData?.description || '-';
  const size = props.assignmentData?.size || '-';
  const color = props.sampleColor || props.assignmentData?.color || '-';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${roundName} Quality Feedback - Style ${styleNo} (${modelName})</title>
  <style>
    body {
      margin: 0;
      padding: 24px 12px;
      background-color: #F5EFEA;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #3F1A28;
    }
    .card {
      max-width: 680px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(74,32,51,0.08);
      border: 1px solid #EAD8D0;
    }
    .header-img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 10px 10px 0 0;
    }
    .top-section {
      padding: 24px 32px 16px 32px;
      background: linear-gradient(180deg, #FFF8F5 0%, #FFFFFF 100%);
      border-bottom: 1px solid #F2E4DE;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background-color: #FDEFF2;
      color: #8F435A;
      font-weight: 700;
      font-size: 13px;
      border-radius: 20px;
      border: 1px solid #F5CCD6;
    }
    .detail-box {
      margin-top: 18px;
      background-color: #FAF2EE;
      border: 1px solid #E8D3C8;
      border-radius: 8px;
      padding: 12px 18px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #3F1A28;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #E2CEC3;
      border-radius: 6px;
      overflow: hidden;
      font-size: 12.5px;
    }
    th {
      background-color: #8F435A;
      color: #FFFFFF;
      font-weight: 600;
      padding: 10px 12px;
      text-align: left;
      border: 1px solid #A2566D;
    }
    td {
      padding: 12px 16px;
      border: 1px solid #E8D8D0;
    }
    .quote-box {
      background-color: #FFFFFF;
      border-left: 4px solid #8F435A;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      box-shadow: 0 2px 8px rgba(143,67,90,0.04);
      font-style: italic;
      line-height: 1.6;
    }
    .footer {
      padding: 16px 32px;
      background-color: #381523;
      color: #D8BAC5;
      font-size: 11.5px;
      text-align: center;
    }
    @media print {
      body { background-color: #FFFFFF; padding: 0; }
      .card { box-shadow: none; border: 1px solid #EAD8D0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="background-color:#FBF2EC;line-height:0;text-align:center;">
      <img src="https://i.ibb.co/4nRrhV9H/Chat-GPT-Image-May-15-2026-11-46-42-AM.png" alt="SOIE Lingerie Survey Form" class="header-img" />
    </div>

    <div class="top-section">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#8F435A;text-transform:uppercase;margin-bottom:4px;">
            SOIE FIT AUDIT &bull; ${roundOrdinal} ROUND EVALUATION
          </div>
          <div style="font-size:22px;font-weight:700;color:#3F1A28;line-height:1.2;">
            Quality Feedback Update
          </div>
        </div>
        <div>
          <span class="badge">${modelName}</span>
        </div>
      </div>

      <div class="detail-box">
        <div style="display:flex;justify-content:space-between;">
          <div style="font-size:13px;color:#634651;">
            <strong style="color:#3F1A28;">Model Name:</strong>
            <span style="font-weight:600;color:#8F435A;margin-left:6px;">${modelName}</span>
          </div>
          <div style="font-size:13px;color:#634651;">
            <strong style="color:#3F1A28;">Type of Sample:</strong>
            <span style="font-weight:600;color:#3F1A28;margin-left:6px;">${sampleType}</span>
          </div>
        </div>
      </div>
    </div>

    <div style="padding:20px 32px 12px 32px;">
      <div class="section-title">Sample Specifications</div>
      <table>
        <thead>
          <tr>
            <th>Style no</th>
            <th>Description</th>
            <th style="text-align:center;">Size</th>
            <th>Sample color</th>
            <th>Sample given for Fit date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight:700;color:#8F435A;">${styleNo}</td>
            <td style="line-height:1.4;">${description}</td>
            <td style="text-align:center;font-weight:600;">${size}</td>
            <td>${color}</td>
            <td>${props.sampleGivenFitDate || '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="padding:16px 32px 24px 32px;">
      <div class="section-title">${roundName} Fit &amp; Wash Evaluation</div>
      <table>
        <tbody>
          <tr style="background-color:#FAF3EF;">
            <td style="width:38%;font-weight:700;color:#3F1A28;">Sample received date</td>
            <td style="width:62%;color:#4A2C37;font-weight:600;">${props.sampleReceivedDate || '-'}</td>
          </tr>
          <tr style="background-color:#FFFFFF;">
            <td style="font-weight:700;color:#3F1A28;">Comments Date</td>
            <td style="color:#4A2C37;font-weight:600;">${props.commentsDate || '-'}</td>
          </tr>
          <tr style="background-color:#FAF3EF;">
            <td style="font-weight:700;color:#3F1A28;vertical-align:top;">Fit comments before wash</td>
            <td style="color:#332228;line-height:1.5;">${props.fitBeforeWash || 'No remarks noted'}</td>
          </tr>
          <tr style="background-color:#FFFFFF;">
            <td style="font-weight:700;color:#3F1A28;vertical-align:top;">Fit comments after wash</td>
            <td style="color:#332228;line-height:1.5;">${props.fitAfterWash || 'No remarks noted'}</td>
          </tr>
          <tr style="background-color:#FAF3EF;">
            <td style="font-weight:700;color:#3F1A28;vertical-align:top;">Comments on fabric / trims</td>
            <td style="color:#332228;line-height:1.5;">${props.commentsFabricTrims || 'No remarks noted'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="padding:20px 32px 28px 32px;background-color:#FFF9F6;border-top:1px solid #F0DFD7;">
      <div class="quote-box">
        &ldquo;Thanks for your feedback. Your valuable feedback is essential for our continuous improvement and service excellence.&rdquo;
      </div>

      <div style="margin-top:24px;font-size:13.5px;color:#553844;line-height:1.6;">
        Warm regards,<br>
        <strong style="color:#3F1A28;font-size:14.5px;">Deepika</strong><br>
        <span>Lead Designer &amp; Quality Audit Team</span><br>
        <span style="color:#8F435A;font-weight:600;">SOIE &bull; Ginza Industries Limited</span><br>
        <a href="mailto:designer02@soie.in" style="color:#8F435A;text-decoration:none;">designer02@soie.in</a>
      </div>
    </div>

    <div class="footer">
      This is an automated quality feedback notification from SOIE Design Studio &bull; Ginza Industries Ltd.
    </div>
  </div>
</body>
</html>`;
}

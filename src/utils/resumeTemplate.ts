export function generateResumeHtml(resumeData: any): string {
  const { personalInfo, summary, experience, skills, projects, education } = resumeData;

  const skillsHtml = skills && skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">SKILLS</h2>
      <p class="text">${skills.join(', ')}</p>
    </div>
  ` : '';

  const experienceHtml = experience && experience.length > 0 ? `
    <div class="section">
      <h2 class="section-title">EXPERIENCE</h2>
      ${experience.map((exp: any) => `
        <div class="item">
          <div class="item-header">
            <span class="item-title">${exp.role || exp.jobTitle}</span>
            <span class="item-date">${exp.duration || ''}</span>
          </div>
          <div class="item-subtitle">${exp.company || exp.companyName}</div>
          <p class="item-desc">${exp.description || ''}</p>
        </div>
      `).join('')}
    </div>
  ` : '';

  const projectsHtml = projects && projects.length > 0 ? `
    <div class="section">
      <h2 class="section-title">PROJECTS</h2>
      ${projects.map((proj: any) => `
        <div class="item">
          <div class="item-header">
            <span class="item-title">${proj.name}</span>
          </div>
          <div class="item-subtitle">${Array.isArray(proj.technologies) ? proj.technologies.join(', ') : proj.technologies || ''}</div>
          <p class="item-desc">${proj.description || ''}</p>
        </div>
      `).join('')}
    </div>
  ` : '';

  const educationHtml = education && education.length > 0 ? `
    <div class="section">
      <h2 class="section-title">EDUCATION</h2>
      ${education.map((edu: any) => `
        <div class="item">
          <div class="item-header">
            <span class="item-title">${edu.degree}</span>
            <span class="item-date">${edu.year || edu.date || ''}</span>
          </div>
          <div class="item-subtitle">${edu.school || edu.institution}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1a1a1a;
          margin: 0;
          padding: 40px;
          line-height: 1.5;
          font-size: 11px;
        }
        .header {
          text-align: center;
          margin-bottom: 24px;
        }
        .name {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin: 0 0 8px 0;
          text-transform: uppercase;
        }
        .contact-info {
          font-size: 10px;
          color: #555;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .contact-info a {
          color: #555;
          text-decoration: none;
        }
        .section {
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 700;
          color: #000;
          border-bottom: 1px solid #000;
          padding-bottom: 4px;
          margin: 0 0 12px 0;
          letter-spacing: 1px;
        }
        .text {
          margin: 0;
        }
        .item {
          margin-bottom: 12px;
        }
        .item:last-child {
          margin-bottom: 0;
        }
        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 2px;
        }
        .item-title {
          font-weight: 700;
          font-size: 12px;
        }
        .item-date {
          font-size: 10px;
          color: #555;
          font-weight: 500;
        }
        .item-subtitle {
          font-style: italic;
          color: #444;
          margin-bottom: 4px;
        }
        .item-desc {
          margin: 0;
          text-align: justify;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="name">${personalInfo?.name || 'Resume'}</h1>
        <div class="contact-info">
          ${personalInfo?.email ? `<span>${personalInfo.email}</span>` : ''}
          ${personalInfo?.phone ? `<span>${personalInfo.phone}</span>` : ''}
          ${personalInfo?.location ? `<span>${personalInfo.location}</span>` : ''}
          ${personalInfo?.linkedin ? `<a href="${personalInfo.linkedin}">LinkedIn</a>` : ''}
          ${personalInfo?.github ? `<a href="${personalInfo.github}">GitHub</a>` : ''}
        </div>
      </div>

      ${summary ? `
        <div class="section">
          <h2 class="section-title">SUMMARY</h2>
          <p class="text" style="text-align: justify;">${summary}</p>
        </div>
      ` : ''}

      ${skillsHtml}
      ${experienceHtml}
      ${projectsHtml}
      ${educationHtml}
    </body>
    </html>
  `;
}

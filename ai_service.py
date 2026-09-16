"""AI Service for CV Tailoring, Keyword Enhancement, Personal Statements, and ATS Scoring.

Supports:
- OpenAI ChatGPT API (e.g. gpt-4o-mini, gpt-4o)
- Google Gemini API (e.g. gemini-1.5-flash, gemini-2.0-flash)
- Built-in Smart Heuristic Engine (Offline fallback requiring zero API keys)

All prompts and heuristics strictly enforce:
- Authentic humanized tone (stripping AI markers: 'tapestry', 'delve', 'testament', 'beacon', 'spearheaded a multitude')
- Civil Service Success Profiles alignment (Behaviours, Strengths, Experience)
- ATS 90+ keyword density and structural compliance
"""

import os
import re
import json
import logging
from typing import Dict, List, Optional, Tuple
import requests

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO)

# AI telltales to strictly eradicate from generated content
AI_CLICHE_WORDS = [
    r"\btapestry\b", r"\bdelve\b", r"\bdelving\b", r"\btestament\b", r"\bbeacon\b",
    r"\bpivotal role\b", r"\bvital role\b", r"\bin today's rapidly (?:changing|evolving) world\b",
    r"\bspearheaded a multitude\b", r"\bseamlessly (?:orchestrating|navigating)\b",
    r"\bplethora\b", r"\bmultifaceted\b", r"\bholistic approach\b", r"\bgame-changer\b",
    r"\bparamount\b", r"\bcornerstone\b", r"\brobust framework\b", r"\bfoster(?:ing)? innovation\b",
    r"\bheralded\b", r"\bindomitable\b", r"\bunwavering commitment\b"
]

CIVIL_SERVICE_BEHAVIOURS = [
    "Seeing the Big Picture",
    "Changing and Improving",
    "Making Effective Decisions",
    "Leadership",
    "Communicating and Influencing",
    "Working Together",
    "Developing Self and Others",
    "Managing a Quality Service",
    "Delivering at Pace"
]

DEFAULT_CV_TEMPLATE = """# ALEX MORGAN
London, United Kingdom | +44 7700 900123 | alex.morgan@email.co.uk | linkedin.com/in/alexmorgan-uk

## PROFESSIONAL SUMMARY
Results-driven public sector and operational specialist with over 6 years of experience managing workflow, stakeholder engagement, and process improvements. Proven ability to lead cross-functional teams, implement compliance standards, and deliver high-quality public service outcomes while consistently delivering at pace and making evidence-based decisions.

## CORE COMPETENCIES
- Operational Workflow Management & Quality Assurance
- Civil Service Success Profiles & Governance Compliance
- Stakeholder Communication & Relationship Management
- Team Leadership, Mentoring & Capability Building
- Data Analysis, Risk Assessment & Process Optimization
- Resource Allocation, Budget Tracking & Project Delivery

## PROFESSIONAL EXPERIENCE

### Senior Operations Lead | Department for Work & Pensions (DWP)
*London, UK* | *2022 - Present*
- Managed a multidisciplinary operational delivery team of 14 staff, achieving a 96% on-time service standard compliance rate across regional public service casework.
- Spearheaded the redesign of workflow intake triage, reducing processing backlog by 28% within 6 months while maintaining strict data governance.
- Collaborated closely with senior civil service stakeholders and regional delivery partners to communicate complex policy updates clearly and effectively.
- Conducted regular operational risk audits and implemented continuous improvement initiatives to minimize delivery errors by 18%.

### Project Delivery Officer | Ministry of Justice (MoJ)
*London, UK* | *2019 - 2022*
- Coordinated delivery milestones for a £1.8M facilities and operational modernization programme across 4 regional sites.
- Monitored project risk registers, tracking key performance indicators and reporting bi-weekly delivery progress to executive governance boards.
- Facilitated cross-departmental working groups to resolve operational bottlenecks, improving cross-team handover speed by 22%.
- Mentored 4 apprentice caseworkers through competency development, supporting their progression to Executive Officer grade.

## EDUCATION & QUALIFICATIONS
- **BSc (Hons) Public Administration & Management (2:1)** | University of London | *2019*
- **Prince2 Foundation & Practitioner Certified** | AXELOS | *2021*
- **Civil Service Continuous Professional Development (CPD)** | Leadership & Service Delivery | *2023*
"""


def clean_humanized_text(text: str) -> str:
    """Sanitize AI output to sound natural, direct, and free of typical generative AI tropes."""
    cleaned = text
    for pat in AI_CLICHE_WORDS:
        cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE)
    # Clean up double spaces or awkward leftover punctuation
    cleaned = re.sub(r"  +", " ", cleaned)
    cleaned = re.sub(r" ,\s*", ", ", cleaned)
    cleaned = re.sub(r" \.\s*", ". ", cleaned)
    return cleaned.strip()


class AIService:
    def __init__(self):
        pass

    def _get_api_config(self, user_key: Optional[str] = None, provider: str = "openai") -> Tuple[str, Optional[str]]:
        """Resolve which AI provider and key to use."""
        env_openai = os.getenv("OPENAI_API_KEY")
        env_gemini = os.getenv("GEMINI_API_KEY")

        if provider == "gemini":
            key = user_key or env_gemini
            if key:
                return "gemini", key
        elif provider == "openai":
            key = user_key or env_openai
            if key:
                return "openai", key

        # Fallback check if user didn't specify provider or key
        if user_key:
            if user_key.startswith("AIzaSy"):
                return "gemini", user_key
            else:
                return "openai", user_key

        if env_openai:
            return "openai", env_openai
        if env_gemini:
            return "gemini", env_gemini

        return "offline", None

    def _call_openai(self, system_prompt: str, user_prompt: str, api_key: str, model: str = "gpt-4o-mini") -> str:
        """Execute request to OpenAI Chat Completions API."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.6
        }
        res = requests.post(url, headers=headers, json=data, timeout=45)
        if res.status_code != 200:
            err_msg = res.json().get("error", {}).get("message", res.text)
            raise ValueError(f"OpenAI API Error ({res.status_code}): {err_msg}")
        result = res.json()
        return result["choices"][0]["message"]["content"].strip()

    def _call_gemini(self, system_prompt: str, user_prompt: str, api_key: str, model: str = "gemini-1.5-flash") -> str:
        """Execute request to Google Gemini API."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        full_prompt = f"{system_prompt}\n\nTask:\n{user_prompt}"
        data = {
            "contents": [
                {
                    "parts": [{"text": full_prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.6
            }
        }
        res = requests.post(url, headers=headers, json=data, timeout=45)
        if res.status_code != 200:
            err_msg = res.json().get("error", {}).get("message", res.text)
            raise ValueError(f"Gemini API Error ({res.status_code}): {err_msg}")
        result = res.json()
        candidates = result.get("candidates", [])
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()
        return ""

    def query_llm(self, system_prompt: str, user_prompt: str, api_key: Optional[str] = None, provider: str = "openai") -> Optional[str]:
        """Dispatch query to chosen LLM provider, returning None if offline engine requested."""
        resolved_provider, resolved_key = self._get_api_config(api_key, provider)
        if resolved_provider == "offline" or not resolved_key:
            return None

        try:
            if resolved_provider == "openai":
                return self._call_openai(system_prompt, user_prompt, resolved_key)
            elif resolved_provider == "gemini":
                return self._call_gemini(system_prompt, user_prompt, resolved_key)
        except Exception as e:
            logger.warning(f"LLM API call failed ({resolved_provider}): {e}. Falling back to smart offline heuristic engine.")
            return None
        return None

    # ==========================================
    # Keyword Extraction & Match Analysis
    # ==========================================

    def extract_keywords_from_job(self, job_data: Dict) -> Dict[str, List[str]]:
        """
        Extract high-impact Civil Service & role-specific keywords from job metadata and description.
        Returns categorized dictionary: technical, behaviours, experience, qualifications.
        """
        title = job_data.get("title", "")
        desc = job_data.get("description", "") + " " + job_data.get("person_specification", "") + " " + job_data.get("technical_skills", "")
        combined = f"{title}\n{desc}".lower()

        keywords: Dict[str, List[str]] = {
            "technical": [],
            "behaviours": [],
            "experience": [],
            "qualifications": []
        }

        # 1. Detect Civil Service Behaviours
        for b in CIVIL_SERVICE_BEHAVIOURS:
            if b.lower() in combined or re.search(r"\b" + re.escape(b.lower()) + r"\b", combined):
                keywords["behaviours"].append(b)

        # 2. Extract technical / domain keywords based on role content
        tech_patterns = [
            ("Woodworking Machinery", r"woodwork|machinist|carpentry|joinery|timber|spindle|saw"),
            ("Health & Safety Compliance", r"health and safety|risk assessment|coshh|safe operating|hse|ppe"),
            ("Workshop Supervision", r"workshop|instruction|tooling|maintenance|equipment|supervision"),
            ("Quality Assurance", r"quality assurance|qa|inspections|standards|precision|specifications"),
            ("Inventory & Stock Management", r"stock control|inventory|materials management|procurement"),
            ("Project Management", r"prince2|agile|project management|scrum|delivery milestones"),
            ("Data Governance & Security", r"gdpr|data protection|security clearance|information governance"),
            ("Stakeholder Engagement", r"stakeholder management|cross-functional|briefings|partnerships"),
            ("Policy Implementation", r"policy analysis|statutory compliance|regulatory framework"),
            ("Casework Management", r"casework|tribunals|adjudication|claims processing"),
            ("Budget & Resource Allocation", r"budget management|commercial awareness|value for money"),
            ("Continuous Improvement", r"continuous improvement|process optimization|lean|six sigma"),
            ("Digital Literacy", r"excel|databases|mis systems|erp|reporting tools")
        ]

        for label, pat in tech_patterns:
            if re.search(pat, combined):
                keywords["technical"].append(label)

        # 3. Experience & General Competencies
        exp_patterns = [
            ("Team Leadership & Mentoring", r"leading teams|supervising|line management|mentoring|coaching"),
            ("Operational Delivery", r"operational delivery|frontline|public service|casework delivery"),
            ("Analytical Problem Solving", r"analytical|problem solving|evidence-based|evaluating data"),
            ("Customer & Citizen Focus", r"customer service|public interface|citizen engagement|user needs")
        ]
        for label, pat in exp_patterns:
            if re.search(pat, combined):
                keywords["experience"].append(label)

        # 4. Qualifications
        qual_patterns = [
            ("Level 3 NVQ / City & Guilds", r"level 3|nvq|city and guilds|apprenticeship"),
            ("Prince2 / Agile Qualification", r"prince2|agile certified|pmp"),
            ("Degree or Equivalent Experience", r"degree|higher education|equivalent qualification"),
            ("Security Clearance (BPSS / SC / CTC)", r"security check|bpss|security clearance|counter terror")
        ]
        for label, pat in qual_patterns:
            if re.search(pat, combined):
                keywords["qualifications"].append(label)

        # Fallback guarantees if sparse advert
        if not keywords["behaviours"]:
            keywords["behaviours"] = ["Making Effective Decisions", "Delivering at Pace", "Communicating and Influencing"]
        if not keywords["technical"]:
            keywords["technical"] = ["Operational Delivery", "Compliance Standards", "Quality Assurance"]

        return keywords

    def analyze_cv_keywords(self, cv_text: str, job_data: Dict, api_key: Optional[str] = None, provider: str = "openai") -> Dict:
        """
        Analyze user's CV against job keywords.
        Returns:
        - match_score (0-100)
        - matched_keywords
        - missing_keywords
        - recommendations
        """
        extracted = self.extract_keywords_from_job(job_data)
        all_keywords = []
        for cat, items in extracted.items():
            for item in items:
                all_keywords.append({"keyword": item, "category": cat})

        cv_lower = cv_text.lower()
        matched = []
        missing = []

        for item in all_keywords:
            kw = item["keyword"]
            # Check presence via tokens
            words = [w for w in re.split(r"[\s/&]+", kw.lower()) if len(w) > 2]
            # If all major words or the phrase exists in CV
            if kw.lower() in cv_lower or (words and sum(1 for w in words if w in cv_lower) >= max(1, len(words) - 1)):
                matched.append(item)
            else:
                missing.append(item)

        total = len(all_keywords) or 1
        ats_score = self.calculate_ats_score(cv_text, job_data, matched, missing)

        return {
            "ats_score": ats_score["total_score"],
            "ats_details": ats_score,
            "categorized_keywords": extracted,
            "matched_keywords": matched,
            "missing_keywords": missing,
            "total_keywords": total,
            "matched_count": len(matched),
            "missing_count": len(missing)
        }

    # ==========================================
    # ATS 90+ Scoring Engine
    # ==========================================

    def calculate_ats_score(self, cv_text: str, job_data: Dict, matched: List[Dict], missing: List[Dict]) -> Dict:
        """
        Compute rigorous ATS compatibility score (0-100) based on:
        - Keyword Density & Essential Skills (40 pts)
        - Civil Service Behaviours & Success Profiles (20 pts)
        - Quantified Metrics & Action Verbs (20 pts)
        - Structure, Clear Standard Headings & Readability (20 pts)
        """
        cv_clean = cv_text.strip()
        if not cv_clean:
            return {
                "total_score": 0,
                "breakdown": {"keywords": 0, "behaviours": 0, "metrics": 0, "formatting": 0},
                "status": "Incomplete",
                "tips": ["Please add or load your CV to analyze ATS compatibility."]
            }

        total_kw = len(matched) + len(missing)
        kw_ratio = (len(matched) / total_kw) if total_kw > 0 else 0.5
        keywords_score = round(kw_ratio * 40)

        # Civil Service Behaviours score (20 pts)
        cv_lower = cv_clean.lower()
        matched_behaviours = 0
        for b in CIVIL_SERVICE_BEHAVIOURS:
            if b.lower() in cv_lower or any(part in cv_lower for part in b.lower().split()):
                matched_behaviours += 1
        behaviours_score = min(20, round((matched_behaviours / 3) * 20))

        # Quantified Metrics & Action Verbs score (20 pts)
        # Check for numbers, %, £, metrics, and strong action verbs
        metrics_found = len(re.findall(r"\b\d+%\b|£\d+|\b\d+\s*(?:members|staff|projects|months|years|k)\b", cv_clean, re.I))
        action_verbs = [
            "managed", "led", "delivered", "coordinated", "implemented", "achieved",
            "developed", "spearheaded", "resolved", "improved", "designed", "streamlined",
            "evaluated", "collaborated", "facilitated", "supervised"
        ]
        verbs_count = sum(1 for v in action_verbs if re.search(r"\b" + v + r"\b", cv_lower))
        metrics_score = min(20, (metrics_found * 2) + min(10, verbs_count))

        # Structure & Standard Headings (20 pts)
        expected_sections = ["summary", "experience", "skills|competencies", "education"]
        found_sections = 0
        for s in expected_sections:
            if re.search(r"^##?\s+.*(" + s + ")", cv_clean, re.IGNORECASE | re.MULTILINE):
                found_sections += 1
        formatting_score = min(20, found_sections * 5)

        total_score = min(100, keywords_score + behaviours_score + metrics_score + formatting_score)

        tips = []
        if missing:
            top_missing = [m["keyword"] for m in missing[:3]]
            tips.append(f"Add missing keywords: {', '.join(top_missing)} using the interactive assistant.")
        if metrics_found < 3:
            tips.append("Add 2-3 quantified achievements (e.g. 'improved processing by 15%', 'managed team of 8').")
        if matched_behaviours < 2:
            tips.append("Include specific Civil Service Behaviours like 'Delivering at Pace' or 'Making Effective Decisions'.")
        if found_sections < 4:
            tips.append("Ensure your CV has standard section headers: Professional Summary, Core Skills, Experience, Education.")

        if total_score >= 90:
            status = "ATS Ready (Excellent - 90%+)"
        elif total_score >= 75:
            status = "Strong (75-89%) - Near ATS Optimization"
        else:
            status = "Needs Improvement (<75%)"

        return {
            "total_score": total_score,
            "breakdown": {
                "keywords": keywords_score,
                "behaviours": behaviours_score,
                "metrics": metrics_score,
                "formatting": formatting_score
            },
            "status": status,
            "tips": tips
        }

    # ==========================================
    # Interactive Keyword Clarifier & Interviewer
    # ==========================================

    def generate_keyword_question(self, keyword: str, category: str, job_title: str, api_key: Optional[str] = None, provider: str = "openai") -> Dict:
        """
        Formulate an intelligent, contextual interview question for a missing keyword to ask the user.
        """
        system_prompt = (
            "You are an expert UK Civil Service career interview coach. "
            "Your goal is to formulate a friendly, specific question asking the candidate about their practical experience "
            "with a target keyword for an application. Be concise, direct, and encourage them to share a specific example or metric. "
            "Never use robotic AI clichés."
        )
        user_prompt = (
            f"Target Keyword: {keyword}\n"
            f"Category: {category}\n"
            f"Job Vacancy: {job_title}\n\n"
            f"Create a single natural interview question asking the user if and how they used '{keyword}' in past or current roles, "
            f"plus 2 bullet points suggesting what details or metrics they could mention."
        )

        llm_reply = self.query_llm(system_prompt, user_prompt, api_key, provider)
        if llm_reply:
            return {
                "keyword": keyword,
                "category": category,
                "question": clean_humanized_text(llm_reply)
            }

        # Offline heuristic fallback
        question_templates = {
            "technical": f"Do you have practical experience with '{keyword}'? In what context or projects have you applied this skill?",
            "behaviours": f"How have you demonstrated the Civil Service behaviour '{keyword}' in your previous work? Can you share a specific situation and the outcome you delivered?",
            "experience": f"Have you undertaken duties relating to '{keyword}'? What were your key responsibilities and measurable results?",
            "qualifications": f"Do you hold credentials or equivalent background in '{keyword}', or are you actively working towards it?"
        }

        q_text = question_templates.get(category, f"How would you describe your experience with '{keyword}'?")
        suggestions = [
            "Mention the tools, scale, or team setting involved.",
            "Include a concrete result or metric (e.g., 'reduced turnaround by 15%', 'trained 6 team members')."
        ]

        return {
            "keyword": keyword,
            "category": category,
            "question": f"{q_text}\n\n**Helpful details to include:**\n- {suggestions[0]}\n- {suggestions[1]}"
        }

    def integrate_keyword_suggestion(
        self,
        keyword: str,
        user_experience: str,
        cv_text: str,
        job_title: str,
        api_key: Optional[str] = None,
        provider: str = "openai"
    ) -> Dict:
        """
        Combine user's input with the keyword to craft an authentic, humanized CV bullet point and placement recommendation.
        """
        system_prompt = (
            "You are an expert UK Civil Service CV writer. You transform candidate notes into authentic, high-impact "
            "CV bullet points or statements tailored for ATS screening (90+ score). "
            "STRICT RULES:\n"
            "1. Absolutely DO NOT use AI tropes like 'tapestry', 'delve', 'testament', 'pivotal role', 'spearheaded a multitude'.\n"
            "2. Write in active past or present tense, clear British English, matching Civil Service style.\n"
            "3. Seamlessly weave in the target keyword.\n"
            "4. Specify where in the CV this bullet should ideally be placed (e.g. 'Under your most recent role' or 'In Core Competencies')."
        )
        user_prompt = (
            f"Target Keyword to Integrate: {keyword}\n"
            f"Candidate's Real Experience / Notes: {user_experience}\n"
            f"Target Job: {job_title}\n\n"
            f"Return JSON format:\n"
            f'{{"suggested_bullet": "...", "placement": "...", "explanation": "..."}}'
        )

        llm_reply = self.query_llm(system_prompt, user_prompt, api_key, provider)
        if llm_reply:
            try:
                # Extract json block if surrounded by markdown
                m = re.search(r"\{.*\}", llm_reply, re.DOTALL)
                if m:
                    parsed = json.loads(m.group(0))
                    return {
                        "keyword": keyword,
                        "suggested_bullet": clean_humanized_text(parsed.get("suggested_bullet", "")),
                        "placement": parsed.get("placement", "Experience Section"),
                        "explanation": clean_humanized_text(parsed.get("explanation", "Incorporates keyword naturally."))
                    }
            except Exception:
                pass

        # Offline fallback synthesis
        clean_input = user_experience.strip()
        if not clean_input:
            clean_input = f"Delivered high standard of work utilizing {keyword} across operational tasks"

        # Build clean bullet using action verbs
        first_word = clean_input.split()[0].lower() if clean_input else ""
        if first_word in ["i", "we"]:
            clean_input = " ".join(clean_input.split()[1:])

        bullet = f"Applied {keyword} to {clean_input.rstrip('.')}, ensuring compliance with organizational standards and timely delivery."

        return {
            "keyword": keyword,
            "suggested_bullet": bullet,
            "placement": "Under your most relevant Professional Experience role or Core Competencies list",
            "explanation": f"Clearly demonstrates your practical application of {keyword} in authentic public sector phrasing."
        }

    # ==========================================
    # Personal Statement Generator (Success Profiles)
    # ==========================================

    def generate_personal_statement(
        self,
        cv_text: str,
        job_data: Dict,
        target_words: int = 750,
        focus_behaviours: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        provider: str = "openai"
    ) -> Dict:
        """
        Generate a bespoke Civil Service Personal Statement adhering to Success Profiles.
        Uses STAR methodology (Situation, Task, Action, Result) and avoids AI clichés.
        """
        title = job_data.get("title", "Civil Service Position")
        dept = job_data.get("department", "HM Government")
        desc = job_data.get("description", "")[:1500]
        behaviours = focus_behaviours or ["Making Effective Decisions", "Delivering at Pace", "Communicating and Influencing"]

        system_prompt = (
            "You are a Senior Civil Service Recruitment Assessor and expert application writer. "
            "Write an exceptional, humanized Civil Service Personal Statement for the candidate based strictly on their CV. "
            "STRICT GUIDELINES:\n"
            "1. Adhere to the UK Civil Service Success Profiles framework (Experience, Behaviours, Strengths, Technical Skills).\n"
            "2. Structure evidence using the STAR approach (Situation, Task, Action, Result) with clear metrics where available in the CV.\n"
            "3. NO AI CLICHÉS: Never use words like 'testament', 'tapestry', 'delve', 'beacon', 'pivotal role', 'in today's world'.\n"
            "4. Tone: Confident, professional, objective British public sector English.\n"
            f"5. Word Count Target: Approximately {target_words} words (stay within +/- 10%).\n"
            f"6. Integrate key behaviours: {', '.join(behaviours)}."
        )

        user_prompt = (
            f"Job Title: {title}\n"
            f"Department: {dept}\n"
            f"Job Context / Essential Criteria:\n{desc}\n\n"
            f"Candidate CV:\n{cv_text[:3000]}\n\n"
            f"Write the Personal Statement now with clear section headers aligned to the essential criteria and key behaviours."
        )

        llm_reply = self.query_llm(system_prompt, user_prompt, api_key, provider)
        if llm_reply:
            cleaned = clean_humanized_text(llm_reply)
            word_count = len(cleaned.split())
            return {
                "statement": cleaned,
                "word_count": word_count,
                "target_words": target_words,
                "engine": "llm"
            }

        # Offline High-Quality Civil Service Template Generator
        statement_text = f"""## STATEMENT OF SUITABILITY: {title.upper()}
### {dept.upper()}

### Introduction & Motivation
I am writing to express my strong interest in the {title} role within {dept}. With a proven track record in operational delivery, stakeholder communication, and continuous service improvement, I offer directly transferable skills and a commitment to upholding the Civil Service core values of integrity, honesty, objectivity, and impartiality.

### Evidence of Essential Criteria & Technical Competence
Throughout my professional career, I have consistently taken ownership of high-volume, complex operational workflows while adhering to strict governance standards. In my recent roles, I have:
- Managed operational performance, consistently exceeding delivery targets while maintaining a 96% accuracy and compliance rate.
- Conducted regular procedural audits to proactively identify service bottlenecks and implement effective, practical solutions.
- Built collaborative working relationships with cross-functional teams, technical specialists, and external partners to deliver seamless public services.

### Civil Service Behaviours Evidence

#### 1. Making Effective Decisions
In my previous position, our team faced unexpected delays in service dispatch due to legacy process handovers. I analyzed intake data across 300+ casework files, identified the recurring failure points, and developed a revised risk-triage framework. By presenting evidence-based recommendations to department leadership, we streamlined approvals and reduced end-to-end turnaround time by 28% without compromising statutory compliance.

#### 2. Delivering at Pace
When tasked with meeting aggressive departmental milestone targets under constrained resources, I implemented daily progress tracking and reprioritized high-impact tasks. By maintaining clear focus on key deliverables and fostering team resilience, our unit successfully delivered all required outcomes two weeks ahead of the statutory deadline while sustaining high team morale.

#### 3. Communicating and Influencing
Effective public service relies upon clear, transparent communication. I have routinely translated complex technical guidelines and operational updates into concise, accessible guidance for diverse operational teams and service users. During a cross-departmental transition, I led briefing sessions that unified expectations, resolved procedural discrepancies, and secured unanimous stakeholder buy-in.

### Conclusion
I bring the requisite dedication, professional rigour, and problem-solving capability required to excel as {title} within {dept}. I welcome the opportunity to contribute towards your department's strategic goals and deliver outstanding outcomes for the public.
"""
        cleaned = clean_humanized_text(statement_text)
        return {
            "statement": cleaned,
            "word_count": len(cleaned.split()),
            "target_words": target_words,
            "engine": "smart_template"
        }

    # ==========================================
    # Cover Letter Generator
    # ==========================================

    def generate_cover_letter(
        self,
        cv_text: str,
        job_data: Dict,
        api_key: Optional[str] = None,
        provider: str = "openai"
    ) -> Dict:
        """Generate a humanized, tailored UK Civil Service cover letter."""
        title = job_data.get("title", "Civil Service Position")
        dept = job_data.get("department", "HM Government")
        ref = job_data.get("reference_number", "")
        desc = job_data.get("description", "")[:1200]

        system_prompt = (
            "You are an expert UK Civil Service career consultant. "
            "Draft a professional, humanized, compelling covering letter for this job application. "
            "STRICT RULES:\n"
            "1. NO AI tropes (never use 'testament', 'tapestry', 'delve', 'beacon', 'spearheaded a multitude').\n"
            "2. Formal UK business letter format.\n"
            "3. Address the specific Department and reference number.\n"
            "4. Highlight 2-3 specific accomplishments from the candidate's CV that prove capability for this role."
        )
        user_prompt = (
            f"Job Title: {title}\n"
            f"Reference: {ref}\n"
            f"Department: {dept}\n"
            f"Key Requirements:\n{desc}\n\n"
            f"Candidate CV:\n{cv_text[:3000]}\n"
        )

        llm_reply = self.query_llm(system_prompt, user_prompt, api_key, provider)
        if llm_reply:
            cleaned = clean_humanized_text(llm_reply)
            return {"cover_letter": cleaned, "engine": "llm"}

        # Offline fallback letter
        letter = f"""[Candidate Name]
[Address & Postcode]
[Telephone] | [Email Address]

Recruitment Team
{dept}
HM Government

RE: Application for {title} (Vacancy Ref: {ref})

Dear Hiring Team,

I am writing to submit my application for the position of {title} with {dept}. Having followed your department's recent achievements and strategic initiatives, I am eager to apply my operational experience and public service commitment to your team.

My background spans operational workflow management, team collaboration, and compliance with statutory governance standards. Across my previous appointments, I have consistently demonstrated the core Civil Service Behaviours necessary for success in this role:

• Delivering at Pace: I have routinely managed competing priorities under strict deadlines, maintaining service standards and reducing workflow backlog by over 25%.
• Making Effective Decisions: I apply evidence-based analysis and objective risk assessment to resolve operational bottlenecks and ensure value for money.
• Communicating and Influencing: I build collaborative relationships across internal divisions and with public stakeholders, ensuring clarity and mutual accountability.

I am particularly attracted to this vacancy at {dept} because of the opportunity to contribute directly to high-quality public service delivery and operational excellence. My transferable skills and structured approach will allow me to integrate smoothly and deliver immediate positive impact.

Thank you for your time and consideration of my application. I look forward to discussing my suitability with you in further detail.

Yours sincerely,

[Candidate Name]
"""
        return {"cover_letter": clean_humanized_text(letter), "engine": "smart_template"}


# Global singleton instance
ai_service = AIService()

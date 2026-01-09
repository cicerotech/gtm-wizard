import re
import pandas as pd

def main():
    """Parse Harvey employees from document.xml with proper structure"""
    
    xml_file = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/harvey_images/word/document.xml'
    
    with open(xml_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract all text segments
    text_segments = re.findall(r'<w:t[^>]*>([^<]+)</w:t>', content)
    
    print(f"Found {len(text_segments)} text segments")
    
    employees = []
    seen_employees = set()
    
    i = 0
    while i < len(text_segments):
        segment = text_segments[i].strip()
        
        # Look for "Select FirstName LastName" pattern (start of employee entry)
        if segment.startswith('Select ') and len(segment) > 8:
            full_name = segment.replace('Select ', '').strip()
            
            # Skip garbage entries
            if full_name in ['all', 'Profile', 'all Profile']:
                i += 1
                continue
            if len(full_name) < 3:
                i += 1
                continue
            
            # Verify next segment is the name repeated
            if i + 1 < len(text_segments) and text_segments[i + 1].strip() == full_name:
                # This is a valid employee entry - find the end marker
                end_idx = None
                for j in range(i + 2, min(i + 100, len(text_segments))):
                    if text_segments[j].strip() == f'More actions for {full_name}':
                        end_idx = j
                        break
                    # Also check for next "Select" as boundary
                    if text_segments[j].strip().startswith('Select ') and len(text_segments[j].strip()) > 8:
                        end_idx = j - 1
                        break
                
                if not end_idx:
                    end_idx = min(i + 80, len(text_segments) - 1)
                
                # Extract role at Harvey - look for "[Role] at Harvey" in Experience section
                role = None
                education = None
                
                # Find ExperienceProfile experience marker
                exp_start = None
                for j in range(i + 2, end_idx):
                    if 'ExperienceProfile experience' in text_segments[j]:
                        exp_start = j + 1
                        break
                
                if exp_start:
                    # Look for role ending with "at " followed by "Harvey"
                    for j in range(exp_start, min(exp_start + 15, end_idx)):
                        seg = text_segments[j].strip()
                        
                        # Check if segment ends with "at " and next is "Harvey"
                        if seg.endswith(' at ') or seg.endswith(' at'):
                            next_seg = text_segments[j + 1].strip() if j + 1 < len(text_segments) else ''
                            if next_seg == 'Harvey':
                                role = seg.replace(' at ', '').replace(' at', '').strip()
                                # Clean up Enhanced by resume prefix
                                role = re.sub(r'^Enhanced by resume\s*', '', role)
                                break
                        
                        # Check for combined "[Role] at Harvey"
                        if ' at Harvey' in seg:
                            role = seg.split(' at Harvey')[0].strip()
                            role = re.sub(r'^Enhanced by resume\s*', '', role)
                            break
                        
                        # Check for "@ Harvey" pattern
                        if '@ Harvey' in seg or '@Harvey' in seg:
                            role = seg.replace('@ Harvey', '').replace('@Harvey', '').replace(' @ ', '').strip()
                            break
                
                # If no role found in Experience, check headline (segments 3-6 after name)
                if not role:
                    for j in range(i + 3, min(i + 8, end_idx)):
                        seg = text_segments[j].strip()
                        if seg.endswith(' at ') or seg.endswith(' at'):
                            next_seg = text_segments[j + 1].strip() if j + 1 < len(text_segments) else ''
                            if next_seg == 'Harvey':
                                role = seg.replace(' at ', '').replace(' at', '').strip()
                                break
                        if '@ Harvey' in seg or '@Harvey' in seg:
                            role = seg.replace('@ Harvey', '').replace('@Harvey', '').replace(' @ ', '').strip()
                            break
                        if ' at Harvey' in seg:
                            role = seg.split(' at Harvey')[0].strip()
                            break
                
                # Find education
                for j in range(i + 2, end_idx):
                    if 'EducationProfile education' in text_segments[j]:
                        # Next segment should have education
                        if j + 1 < end_idx:
                            edu_seg = text_segments[j + 1].strip()
                            # Parse education - usually "University Name, Degree"
                            if ',' in edu_seg:
                                education = edu_seg.split(',')[0].strip()
                            else:
                                education = edu_seg
                            
                            # Clean up
                            education = education.replace('Profile interest row decorations', '').strip()
                            if education and len(education) > 3:
                                break
                            else:
                                education = None
                
                # Parse first and last name
                name_parts = full_name.split()
                if len(name_parts) >= 2:
                    first_name = name_parts[0]
                    last_name = ' '.join(name_parts[1:])
                else:
                    first_name = full_name
                    last_name = ''
                
                # Create unique key
                emp_key = full_name.lower().replace(' ', '').replace('.', '').replace('-', '').replace("'", "")
                
                if emp_key not in seen_employees and role and len(role) > 2:
                    seen_employees.add(emp_key)
                    
                    # Clean HTML entities
                    role = role.replace('&amp;', '&').replace('&apos;', "'").replace('&quot;', '"')
                    if education:
                        education = education.replace('&amp;', '&').replace('&apos;', "'").replace('&quot;', '"')
                        education = education.rstrip(' ·').strip()
                    
                    employees.append({
                        'full_name': full_name,
                        'first_name': first_name,
                        'last_name': last_name,
                        'role': role,
                        'education': education or ''
                    })
                
                # Skip to after this entry
                i = end_idx
        
        i += 1
    
    print(f"Found {len(employees)} employees")
    
    # Categorize into departments
    processed = []
    for emp in employees:
        title = emp['role']
        title_lower = title.lower() if title else ''
        
        if any(x in title_lower for x in ['software engineer', 'staff engineer', 'principal architect', 
                                           'senior engineer', 'engineering manager', 'research scientist',
                                           'engineering at', 'engineering @', 'machine learning', 'data engineer',
                                           'tech lead', 'infrastructure']) or title_lower == 'engineering':
            department = 'Engineering'
        elif any(x in title_lower for x in ['product manager', 'product at', 'product @', 'design', 
                                             'designer', 'solutions architect', 'product operations']) or title_lower == 'product':
            department = 'Product & Design'
        elif any(x in title_lower for x in ['customer success', 'user operations', 'user ops',
                                             'csm', 'engagement manager', 'partner success', 
                                             'customer engagement']):
            department = 'Customer Success'
        elif any(x in title_lower for x in ['recruiter', 'recruiting', 'talent', 'accountant', 
                                             'accounting', 'counsel', 'paralegal', 'marketing', 
                                             'partnerships', 'strategy', 'legal', 'operations',
                                             'applied legal', 'head of product', 'executive assistant',
                                             'director of marketing']):
            department = 'Operations & G&A'
        else:
            department = 'Sales & GTM'
        
        processed.append({
            'First Name': emp['first_name'],
            'Last Name': emp['last_name'],
            'Title': emp['role'],
            'Department': department,
            'Education': emp['education']
        })
    
    print(f"Processed {len(processed)} employees")
    
    if processed:
        df = pd.DataFrame(processed)
        df = df.sort_values(['Department', 'Last Name', 'First Name'])
        
        output_file = '/Users/keiganpesenti/Desktop/Harvey_Employees_Roster.xlsx'
        
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='All Employees')
            
            for dept in sorted(df['Department'].unique()):
                dept_df = df[df['Department'] == dept]
                sheet_name = dept[:31]
                dept_df.to_excel(writer, index=False, sheet_name=sheet_name)
        
        print(f"\nSaved {len(df)} employees to {output_file}")
        print(f"\nDepartment breakdown:")
        print(df['Department'].value_counts())
        
        print("\n=== FIRST 15 EMPLOYEES (alphabetical by last name) ===")
        for _, row in df.head(15).iterrows():
            print(f"  {row['First Name']:15} {row['Last Name']:20} | {row['Title']:40} | {row['Education']}")
        
        print("\n=== SAMPLE BY DEPARTMENT ===")
        for dept in sorted(df['Department'].unique()):
            print(f"\n{dept} ({len(df[df['Department'] == dept])} employees):")
            dept_df = df[df['Department'] == dept].head(5)
            for _, row in dept_df.iterrows():
                print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")

if __name__ == '__main__':
    main()

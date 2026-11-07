"""Serialize the tested API graph as a ComfyUI editor workflow."""
import json
from pathlib import Path
from run import HERE, ROOT, api

def convert(name):
    graph=json.loads((HERE/(name+'-api.json')).read_text())
    info=api('/object_info')
    positions={'2':[-450,730],'7':[-450,0],'8':[-450,500],
               '17':[50,0],'18':[50,500],
               '9':[700,0],'10':[700,180],'11':[700,360],'12':[700,540],
               '13':[1100,0],'14':[1100,180],'15':[1100,360],'16':[1100,540],
               '19':[1520,420],'20':[1920,0],'21':[2320,0],
               '22':[2720,0],'23':[2720,220],'24':[3140,220]}
    nodes=[]
    by_id={}
    links=[]
    for order,(key,item) in enumerate(graph.items()):
        schema=info[item['class_type']]
        inputs=[]
        widgets=[]
        for category in ['required','optional']:
            for field,config in schema['input'].get(category,{}).items():
                if field not in item['inputs']: continue
                value=item['inputs'][field]
                raw_type=config[0]
                kind='COMBO' if isinstance(raw_type,list) else raw_type
                if isinstance(value,list) and len(value)==2 and str(value[0]) in graph:
                    inputs.append({'name':field,'type':kind,'link':None})
                elif kind in ['STRING','INT','FLOAT','BOOLEAN','COMBO']:
                    widgets.append(value)
                    opts=config[1] if len(config)>1 and isinstance(config[1],dict) else {}
                    if opts.get('control_after_generate'): widgets.append('fixed')
        outputs=[{'name':schema.get('output_name',schema['output'])[i],
                  'type':t,'links':[],'slot_index':i} for i,t in enumerate(schema['output'])]
        n={'id':int(key),'type':item['class_type'],'pos':positions.get(key,[0,0]),
           'size':[540,400] if key in ['17','18'] else [350,320] if key in ['20','21'] else [350,150],
           'flags':{},'order':order,'mode':0,'inputs':inputs,'outputs':outputs,
           'properties':{'Node name for S&R':item['class_type']},'widgets_values':widgets,
           'title':item.get('_meta',{}).get('title',item['class_type'])}
        nodes.append(n); by_id[key]=n
    for key,item in graph.items():
        for slot,socket in enumerate(by_id[key]['inputs']):
            source,source_slot=item['inputs'][socket['name']]
            source=str(source)
            link_id=len(links)+1
            links.append([link_id,int(source),source_slot,int(key),slot,socket['type']])
            socket['link']=link_id
            by_id[source]['outputs'][source_slot]['links'].append(link_id)
    workflow={'last_node_id':max(n['id'] for n in nodes),'last_link_id':len(links),
              'nodes':nodes,'links':links,'groups':[], 'config':{},
              'extra':{'ds':{'scale':0.5,'offset':[500,150]}},'version':0.4}
    dest=ROOT/'workflows'/('33_Punkman_Side_Walk_'+name+'.json')
    dest.write_text(json.dumps(workflow,indent=2))
    (HERE/(name+'-ui.json')).write_text(json.dumps(workflow,indent=2))
    print(dest)

if __name__=='__main__':
    import sys
    convert(sys.argv[1] if len(sys.argv)>1 else 'walk-v1')

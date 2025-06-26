export const UPDATE_LLM_RESPONSE = 'UPDATE_LLM_RESPONSE';

import React, { Children, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { useState } from 'react'; // For debugging / dev. Should never be used in final code.
import { useDispatch } from 'react-redux';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestionCircle, faTimes } from '@fortawesome/free-solid-svg-icons';

import * as lo_event from 'lo_event';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';

import { useComponentSelector, extractChildrenText } from './utils.js';

import { Spinner, Button } from './base_components';
import {TextDisplay, LO_TextInput, StoreVariable, MarkdownDisplay} from './components.js';


// Debug log function. This should perhaps go away / change / DRY eventually.
const DEBUG = false;
const dclog = (...args) => {if(DEBUG) {console.log.apply(console, Array.from(args));} };

export function LLMPrompt({form, section, children}) {
  return <></>;
}

const LLMDialog = ({ children, id, onCloseDialog }) => {
  return (
    <dialog open onClose={onCloseDialog}>
      <div style={styles.dialogHeader}>
        <h2 style={styles.dialogTitle}>Prompt Title</h2>
        <span style={styles.dialogClose} onClick={onCloseDialog}>
          <FontAwesomeIcon icon={faTimes} />
        </span>
      </div>
      <div style={styles.dialogContent}>
        {children}
      </div>
    </dialog>
  );
}

export const ActionButton = ({ children, target, systemPrompt, showPrompt = true, ...props }) => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Your code that uses the window object
      console.log(window.location.href);
    }
  }, []);

  const [dialogVisible, setDialogVisible] = useState(false);

  const onClick = () => {
    //if (clearStates) {
    //    reduxLogger.setState({});
    //}
    React.Children.forEach(children, (child) => {
      dclog("ept", children);
      if (React.isValidElement(child) && child.type === LLMPrompt) {
        const target = child.props.target;
        const temperature = child.props.temperature;
        const tokens = child.props.tokens;
        let form = child.props.form;
        let section = child.props.section;

        if (form==null) {
            form='';
        }
        if (section==null) {
           section = '';
        }
        lo_event.logEvent(
            'STORE_VARIABLE', {
            id: target,
            itemtype: "LLMPrompt",
            form: form,
            section: section            
        });

        let processMessages = false;
        
        React.Children.forEach(child.props.children, (child) => {
          if (child && child.type == "messages") {
            processMessages = true;
            const promptMsgs = child.props.children.map((child) => {
                const promptRole = child.props.role;
                const promptText = extractChildrenText(child);
                return ({role:promptRole, content:promptText})
            })
            //call llm to process prompt, store result in target
            run_llm(target, { prompt: promptMsgs, temperature: temperature, tokens: tokens });
            return;
          }
        })
        if (child && !processMessages) {
          const promptText = extractChildrenText(child);
          const promptMsgs = [
            { role: "system", content: systemPrompt },
            { role: "user", content: promptText },
          ]
          run_llm(child.props.target, { prompt: promptMsgs });
          return; 
        }
        
        
      }        
    });
  };

  const onPromptClick = () => {
    setDialogVisible(true);
  };

  const onCloseDialog = () => {
    setDialogVisible(false);
  };

  return (
    <>
      <Button onClick={onClick} {...props}>
        {children}
      </Button>
      {showPrompt && <span onClick={onPromptClick} style={styles.questionMark}>
                       <FontAwesomeIcon icon={faQuestionCircle} />
                     </span>}
      {dialogVisible && (
        <LLMDialog onCloseDialog={onCloseDialog}> {children} </LLMDialog>
      )}
    </>
  );
};

// Obsolete name
export const LLMButton = ActionButton;

export const LLMFeedback = ({children, id}) => {
  const dispatch = useDispatch();
  let feedback = useComponentSelector(id, s => s?.value ?? '');
  let state = useComponentSelector(id, s => s?.state ?? LLM_INIT);

  /*useEffect(
    () => dispatch(() => run_llm(id, {prompt: 'What day is it today'}))
    , []);*/

  return (
    <div>
      <center> 🤖 </center>
      {state === LLM_RUNNING ? (<Spinner/>) : (<ReactMarkdown>{feedback}</ReactMarkdown>)}
    </div>
  )
};

export const LLMInfo = ({children, id}) => {
  const dispatch = useDispatch();

  let feedback = useComponentSelector(id, s => s?.value ?? '');

  /* need to figure out how to call run_llm when the tab this is in is opened */
  return (
    <>
      <ReactMarkdown>{feedback}</ReactMarkdown>
    </>
  )
};


const LLM_INIT = 'LLM_INIT';
const LLM_RESPONSE = 'LLM_RESPONSE';
const LLM_ERROR = 'LLM_ERROR';
const LLM_RUNNING = 'LLM_RUNNING';

const run_llm = (target, llm_params) => {
  const basePath = process.env.NEXT_PUBLIC_BASEPATH || '';
  //console.log("basePath", basePath);
  lo_event.logEvent(
    UPDATE_LLM_RESPONSE, {
      id: target,
      value: 'Running ...',
      messages: llm_params,
      state: LLM_RUNNING
    });
  fetch(basePath + '/api/llm', {
    method: 'POST',
    body: JSON.stringify(llm_params),
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then((response) => response.json())
    .then((data) => {
      dclog(data);
      lo_event.logEvent(
        UPDATE_LLM_RESPONSE, {
          id: target,
          value: data.response,
          state: LLM_RESPONSE
        });
    })
    .catch((error) => {
      lo_event.logEvent(
        UPDATE_LLM_RESPONSE, {
          id: target,
          value: "Error calling LLM",
          state: LLM_ERROR
        });
      console.error(error);
    });
};

export const LLMWarning = () => (
    <TextDisplay id="LLMWarning">
        <p>
            Warning: Examples generated by an AI may not be factual or appropriate. Use with caution
        </p>
    </TextDisplay>
);

export function OpenAIQuery({promptID, targetID, systemPrompt, queryInstruction, postPrompt, defaultValue}) {
  const promptText = useComponentSelector(promptID, s => s?.value ?? '');

  return (
    <>
      <div className="floatLeftNarrow">
         <LO_TextInput className="medium-narrow" id={promptID} defaultValue={defaultValue} />
         <LLMButton 
           systemPrompt={systemPrompt}>
             <LLMPrompt 
                target={targetID}
                form="psych_sba"
                section="Using AI">
                    {promptText}{postPrompt}
             </LLMPrompt>
             {queryInstruction}
         </LLMButton><br /><br />
         <div style={{"display": "none"}}><StoreVariable id={targetID}></StoreVariable></div>
         </div>
         <div className="floatRightWide">
             <h3>&nbsp;</h3>
             <div><MarkdownDisplay className="fullWindow" text_variable={targetID} /></div>
         </div>
      </>
  );
}


export function AIFeedback({id, target, form, section, systemPrompt, promptButtonText, promptPrefix, promptSuffix, feedbackID}) {
  const promptText = useComponentSelector(id, s => s?.value ?? '');
  return (
    <>
        <LLMButton 
           systemPrompt={systemPrompt}>
           <LLMPrompt 
             target={target}
             form={form}
             section={section}>
                 {promptPrefix}
                 "{promptText}". 
                 {promptSuffix}
           </LLMPrompt>
           {promptButtonText}
        </LLMButton><br /><br />
        <div style={{"display": "none"}}>
             <StoreVariable id={feedbackID} />
        </div>
        <div style={{wordWrap: "break-word", 
                     overflowWrap: "break-word",
                     wordBreak: "normal"}}>
              <MarkdownDisplay className="fullWindow" text_variable={feedbackID} />
        </div>
      </>
  );
}


// This will go in a CSS file later. For dev.
const styles = {
  questionMark: {
    fontSize: '0.75rem',
    color: 'blue',
    cursor: 'pointer',
    marginRight: '0.75rem',
  },
  dialog: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 0 5px rgba(0, 0, 0, 0.2)",
    borderRadius: "5px",
    padding: "20px",
    backgroundColor: "white",
    zIndex: "999",
  },
  dialogHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  dialogTitle: {
    margin: "0",
  },
  dialogClose: {
    cursor: "pointer",
  },
  dialogContent: {
    marginBottom: "20px",
  },
};

